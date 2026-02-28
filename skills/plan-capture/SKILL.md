---
name: plan-capture
disable-model-invocation: true
argument-hint: "[description] [and elaborate|execute|go]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - AskUserQuestion
  - WebFetch
  - WebSearch
description: Quick-capture a new task (optionally elaborate and/or execute)
---

# plan-capture

Quickly capture a task idea with minimal friction. The goal is fast capture — elaboration comes later. Optionally chain into elaboration and/or execution automatically with trailing phrases.

## Arguments

- `$ARGUMENTS`: Optional task description, optionally followed by an auto-proceed phrase (e.g., "Fix login timeout bug", "Fix login bug and elaborate", "Fix login bug and go with branch")

## Steps

1. **Verify initialization**
   - Check for `.plans/config.json`
   - If not found, error: "Not initialized. Run `/plan-init` first."

2. **Parse arguments for description and auto-proceed intent**

   Check `$ARGUMENTS` for trailing auto-proceed phrases. Match against the **end** of the argument string only (case-insensitive). Order matters — check longest patterns first to avoid partial matches:

   | Pattern (at end of `$ARGUMENTS`) | Result |
   |---|---|
   | `(and\|then\|&) go (with\|on) worktree` | `auto_elaborate=true, auto_execute=true, auto_worktree=true` |
   | `(and\|then\|&) execute (with\|on) worktree` | `auto_elaborate=true, auto_execute=true, auto_worktree=true` |
   | `(and\|then\|&) go (with\|on) branch` | `auto_elaborate=true, auto_execute=true, auto_branch=true` |
   | `(and\|then\|&) execute (with\|on) branch` | `auto_elaborate=true, auto_execute=true, auto_branch=true` |
   | `(and\|then\|&) (execute\|go)` | `auto_elaborate=true, auto_execute=true` |
   | `(and\|then\|&) elaborate` | `auto_elaborate=true` |

   - Strip the matched phrase from the end; the remainder is the task description
   - If no phrase matched: `auto_elaborate=false, auto_execute=false, auto_branch=false, auto_worktree=false` — original behavior
   - If description is empty after stripping (or no `$ARGUMENTS` at all), ask: "What task do you want to capture?"
   - **Important:** Phrases only match at the END of arguments — "Fix the elaborate system" does NOT trigger auto-elaborate because "elaborate" is mid-sentence, not preceded by "and/then/&"

3. **Read config and generate ID**
   - Read `.plans/config.json`
   - Get `next_id` value
   - Format as 3-digit zero-padded string (e.g., 1 → "001")

4. **Generate filename**
   - Slugify the description:
     - Lowercase
     - Replace spaces with hyphens
     - Remove special characters (keep alphanumeric and hyphens)
     - Truncate to max 40 characters (at word boundary if possible)
   - Format: `NNN-slug.md` (e.g., `001-fix-login-timeout-bug.md`)

5. **Infer task type**
   Analyze description for keywords:
   - **bug**: "fix", "bug", "broken", "error", "issue", "crash", "fail"
   - **feature**: "add", "new", "implement", "create", "support"
   - **refactor**: "refactor", "clean", "reorganize", "restructure", "improve"
   - **chore**: "update", "upgrade", "config", "setup", "docs", "test"

   Default to "feature" if no keywords match.

6. **Write task file**
   Create `.plans/pending/NNN-slug.md`:
   ```markdown
   # [Title - capitalized description]

   **ID:** [NNN]
   **Created:** [YYYY-MM-DDTHH:MM]
   **Type:** [inferred type]
   **Status:** pending

   ## What
   [Original description]

   ## Why
   _To be filled during elaboration_

   ## How
   _To be filled during elaboration_

   ## Verification
   _To be filled during elaboration_

   ## Impact Scope
   _To be filled during elaboration (if 3+ files affected)_

   ## Changes
   _To be filled during execution_

   ## Notes
   _Additional context_
   ```

7. **Update config.json**
   - Increment `next_id`
   - Write updated config

8. **Update PROGRESS.md stats**
   - Count pending tasks in `.plans/pending/`
   - Update the Stats section

9. **Display confirmation**

   **If `auto_elaborate` is true** (about to chain into elaboration):
   ```
   Captured task #NNN: [Title]
   Type: [type] | Status: pending
   File: .plans/pending/NNN-slug.md
   ```
   Do NOT show "Next:" recommendation — elaboration is about to happen automatically.

   **If `auto_elaborate` is false:**

   **If type is `bug`:**
   ```
   Captured task #NNN: [Title]
   Type: bug | Status: pending
   File: .plans/pending/NNN-slug.md

   Recommendation: Bug fixes benefit significantly from elaboration first.
   It helps identify root cause vs symptoms and prevents fix-revert cycles.

   Next: /plan-elaborate NNN (recommended for bugs)
   ```

   **For all other types:**
   ```
   Captured task #NNN: [Title]
   Type: [type] | Status: pending
   File: .plans/pending/NNN-slug.md

   Next: /plan-elaborate NNN to flesh it out
   ```

10. **Auto-elaborate** (only if `auto_elaborate` is true)

    Print: `--- Auto-elaborating task #NNN ---`

    Read `skills/plan-elaborate/SKILL.md` and follow its steps 1–15 for the newly captured task ID, with `skip_mode = true`:
    - Research sub-agent spawns normally
    - All prompts are auto-accepted (skip mode behavior)
    - If elaboration is on Path A (simple task), auto-select "Yes, proceed"
    - If on Path B (complex task), auto-select first/suggested options throughout

    Show abbreviated confirmation when done:
    ```
    Elaborated #NNN: [Title] (N steps)
    ```

    **If elaboration fails** (e.g., sub-agent error, file read failure):
    - Print warning: `Auto-elaboration failed: [reason]. Task was captured successfully.`
    - Print: `Run /plan-elaborate NNN to elaborate manually.`
    - STOP the chain — do not proceed to auto-execute

    **If `auto_execute` is false**, show:
    ```
    Next: /plan-execute NNN to start working
    ```

11. **Auto-execute** (only if `auto_execute` is true)

    Print: `--- Auto-executing task #NNN ---`

    Read `skills/plan-execute/SKILL.md` and follow its steps 1–15 for the task ID:
    - If `auto_worktree` is true, set `worktree_mode = true` and `branch_mode = true` (auto-create branch + worktree without asking)
    - If `auto_branch` is true (but not `auto_worktree`), set `branch_mode = true` (auto-create git branch without asking)
    - If neither is true, the git branch question proceeds normally (user is asked)
    - Execution proceeds normally — observation steps still pause for user feedback
    - All other interactive prompts (elaboration gate, etc.) behave normally

## Edge Cases

- **No description provided**: Ask the user for one
- **Corrupt config.json**: Reconstruct `next_id` by finding highest ID in pending/ and completed/ directories, then add 1
- **ID collision** (file already exists): Scan directories for actual max ID and use that + 1
- **Very long description**: Truncate slug at word boundary, keep full description in the file
- **`execute` implies `elaborate`**: Auto-execute always runs auto-elaborate first
- **`with branch` / `with worktree` only recognized after a go/execute phrase**: "Fix bug with branch" alone does NOT trigger branch mode
- **Phrases only match at END**: "Fix the elaborate system" has no trailing phrase — "elaborate" is part of the description
- **Elaboration failure stops the chain**: Task is still captured successfully, but auto-execute is skipped
- **No trailing phrase**: Fully backwards-compatible with original behavior
