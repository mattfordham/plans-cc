---
name: plan-complete
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
description: Mark a task as done and archive it
---

# plan-complete

Mark a task as completed, archive it, and update tracking files.

## Critical Requirements

**YOU MUST FOLLOW THESE RULES:**

1. **Branch merge requires interactive prompt** — If the task has a `**Branch:**` field, you MUST call the `AskUserQuestion` tool to ask the user what to do. Do NOT just print "ready to merge" or suggest manual steps.

2. **Follow the exact output format** — Use the format specified in step 16. Do NOT invent your own format or add sections like "Changes Made", "Verification", etc.

3. **No hallucinated commands** — Only suggest `/plan-status` or `/plan-capture`. Commands like `/commit` do not exist.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001") — optional if only one task is in-progress
- Optionally followed by an **auto-accept keyword** that skips confirmation prompts for verification criteria and incomplete checkboxes

### Auto-Accept Keywords

If `$ARGUMENTS` contains any of these words (case-insensitive) alongside the task ID, **automatically accept all remaining criteria** — skip the verification prompt (step 6) and auto-confirm incomplete checkboxes (step 4):

`verified`, `verify`, `quick`, `accept`, `accepted`, `skip`, `done`, `lgtm`, `good`, `approved`, `confirmed`, `yep`, `yolo`, `ship`, `ship it`

**Examples:**
- `/plan-complete 5 verified` — completes task #5, skips verification prompt
- `/plan-complete 12 quick` — completes task #12, auto-accepts everything
- `/plan-complete lgtm` — auto-selects the in-progress task, skips prompts
- `/plan-complete 3 ship it` — completes task #3, skips prompts

**Parsing:** Extract the numeric task ID first, then check if any remaining text matches an auto-accept keyword. If no number is found, treat the entire non-keyword portion as empty (auto-select logic applies).

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

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
     - If `in-progress` or `review`: proceed (ideal)
     - If `pending` or `elaborated`: warn "Task #NNN wasn't started. Are you sure you want to mark it complete?" Require confirmation.
     - If not found: "Task #NNN not found."

4. **Check checkbox completion**
   Parse the How section for checkboxes:
   - Count total: all `- [ ]` and `- [x]` lines
   - Count completed: `- [x]` lines
   - Count incomplete: `- [ ]` lines

   **If incomplete checkboxes exist:**

   **If auto-accept keyword was provided:** Skip the prompt, proceed as if user said "yes". Still log a brief note: `Note: X/Y steps complete (auto-accepted).`

   **Otherwise:** Prompt the user:
   ```
   Task #NNN has incomplete steps (X/Y complete):
   - [ ] Incomplete step 1
   - [ ] Incomplete step 2

   Complete anyway? (yes/no)
   ```
   - If "no": exit and suggest `/plan-execute NNN`
   - If "yes": proceed with warning noted

5. **Check for unresolved issues**
   Parse the Issues section (if present) for checkboxes:
   - Count unchecked issues: `- [ ]` lines
   - Count resolved issues: `- [x]` lines

   **If unresolved issues exist (unchecked items in Issues section):**
   ```
   Cannot complete task #NNN — X unresolved issue(s):
   - [ ] Login button doesn't respond on mobile Safari
   - [ ] Timeout error shows raw stack trace

   Run `/plan-execute NNN` to resolve issues, or manually check them off.
   ```
   - **Block completion** — do not proceed until issues are resolved
   - This is a hard block, not a warning (unlike incomplete How steps)

6. **Display verification criteria**

   **If auto-accept keyword was provided:** Skip the prompt entirely. Proceed without asking. Do NOT display the verification criteria or ask for confirmation.

   **Otherwise:** Show the Verification section and ask:
   ```
   Verification criteria for #NNN:
   [Verification section content]

   Have these criteria been met? (yes/no)
   ```
   - If "no": warn but allow completion if user insists
   - If "yes": proceed

7. **Clean up debug artifacts**

   Search for debug/logging statements that may have been added during task execution (especially during observation steps).

   **Identify files to search:**
   - Parse the task's Changes section for modified file paths
   - If the task has a `**Branch:**` field, also run `git diff --name-only [default-branch]...[task-branch]` to get all changed files
   - If no files can be identified, skip this step silently

   **Search for common debug patterns using Grep:**
   - JS/TS files (`*.js`, `*.ts`, `*.jsx`, `*.tsx`): `console\.log`, `console\.debug`, `debugger`
   - Ruby files (`*.rb`): `\bputs\b`, `\bpp?\b `, `binding\.pry`, `binding\.irb`
   - Python files (`*.py`): `breakpoint\(\)`, `pdb\.set_trace`
   - Go files (`*.go`): `fmt\.Println` (flag for review, may be intentional)
   - Any file: `// DEBUG`, `# DEBUG`, `TODO.*#NNN`, `FIXME.*#NNN` (where NNN is the task ID)

   Only search within the files identified above — do not scan the entire project.

   **If no debug patterns found:** skip silently and proceed to step 8.

   **If debug patterns found:**
   - List each match with file path, line number, and line content
   - **MUST use `AskUserQuestion` tool**:
     - Header: "Debug cleanup"
     - Question: "Found {count} possible debug/logging statement(s) in task files:\n{list of matches}\n\nWhat would you like to do?"
     - Options:
       1. "Remove all" (description: "Delete all identified debug lines")
       2. "Review each" (description: "Review each match individually and decide")
       3. "Keep all" (description: "Leave everything as-is, these are intentional")

   **Based on user response:**
   - "Remove all": Use Edit to remove each debug line from its file
   - "Review each": For each match, show it in context (a few surrounding lines) and use AskUserQuestion with options "Remove" / "Keep" per line. Apply removals with Edit.
   - "Keep all": Proceed without changes

   **If removals were made** and the task has a `**Branch:**` field and `git_commits` is enabled in config.json:
   - Commit the cleanup separately:
     ```bash
     git add [affected files]
     git commit -m "chore: remove debug statements from task #NNN"
     ```

8. **Update task file**
   - Change Status to `completed`
   - Add completion timestamp: `**Completed:** [YYYY-MM-DDTHH:MM]`
   - Remove `**Worktree:**` line if present (defensive cleanup — worktree should already be removed by `/plan-execute`, but remove stale metadata if it persists)
   - Write updated file (still in pending/ temporarily)

9. **Move to completed/**
   - Move file from `.plans/pending/NNN-slug.md` to `.plans/completed/NNN-slug.md`

10. **Clean up state file**
    - Check if `.plans/state/NNN-state.md` exists
    - If it exists, delete it: `rm .plans/state/NNN-state.md`
    - If the `state/` directory is now empty, remove it: `rmdir .plans/state`

11. **Update HISTORY.md**
    - Append row to the history table:
      ```
      | NNN | [Title] | [type] | [YYYY-MM-DD] | [Brief summary from Changes section] |
      ```

12. **Update PROGRESS.md**
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

13. **Pre-merge git check** (if task has a branch)
    - Check if task file has `**Branch:**` field
    - If no branch field, skip to step 16
    - Run `git status --porcelain` to check for uncommitted changes
    - If no uncommitted changes: proceed to step 14
    - If uncommitted changes exist: commit everything together. The user is working alongside you and may have made changes you're not aware of — include them all without prompting.
      ```bash
      git add -A && git commit -m "plan: changes for task #NNN - [title]"
      ```

14. **Ask about branch merge** (if task has a branch)
    - Check if task file has `**Branch:**` field
    - If no branch field, skip to step 16
    - Get the branch name from the task file
    - Determine the default/target branch: `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'` or fall back to main/master
    - **REQUIRED: You MUST use the `AskUserQuestion` tool here** — do NOT skip this or print instructions for the user to follow manually. Call AskUserQuestion with:
      - Header: "Merge branch"
      - Question: "Branch '[branch-name]' is ready to merge to [default-branch]. What would you like to do?"
      - Options:
        1. "Merge and delete branch" — Merge to [default-branch] and delete the feature branch
        2. "Merge and keep branch" — Merge to [default-branch] but keep the feature branch
        3. "Skip merge" — Leave branch as-is, I'll handle it manually
    - **After user responds via AskUserQuestion:**
      - If "Merge and delete branch" or "Merge and keep branch":
        - Check current branch: `git branch --show-current`
        - If not on default branch, checkout: `git checkout [default-branch]`
        - Merge: `git merge [task-branch]`
        - If "Merge and delete branch": `git branch -d [task-branch]`
        - Report success or any merge conflicts
      - If "Skip merge":
        - Note in completion message that branch was not merged

15. **Optional: Git commit**
    - Read config.json for `git_commits` setting
    - If true:
      ```bash
      git add .plans/
      git commit -m "plan: complete #NNN - [title]"
      ```

16. **Display confirmation**

    Print EXACTLY this format (substitute values in {braces}):

    ```
    Task #{id} completed: {title}

    Summary: {one sentence from Changes section}

    Archived to: .plans/completed/{id}-{slug}.md
    Branch: {branch-name} merged to {default-branch}

    Next: /plan-status or /plan-capture
    ```

    **Example output (copy this style exactly):**

    ```
    Task #005 completed: User Model Additions

    Summary: Added company association and pricing override fields to User model.

    Archived to: .plans/completed/005-user-model-additions.md
    Branch: feature/005-user-model-additions merged to main

    Next: /plan-status or /plan-capture
    ```

    **STOP after "Next:" line. Do not add anything else.**

## Edge Cases

- **No ID + one active task**: Auto-select it
- **No ID + multiple active**: List and ask
- **Unresolved issues**: Block completion, show issue list, suggest `/plan-execute`
- **Verification not met**: Warn but allow completion with explicit confirmation
- **Pending/elaborated task** (never started): Extra warning, require confirmation
- **Task not found**: Error with suggestion to `/plan-list`
- **Git commit fails**: Warn but don't fail the completion
- **HISTORY.md malformed**: Append row anyway, it's just a log
- **No files changed**: Skip debug cleanup silently
- **Debug code is intentional**: User selects "Keep all" to preserve it
- **False positives in debug scan**: User selects "Review each" to inspect individually
- **Auto-accept keyword provided**: Skip verification and checkbox prompts, but still enforce unresolved issues block (step 5) and branch merge prompt (step 14) — those are never auto-skipped
