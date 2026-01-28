---
name: plan-capture
disable-model-invocation: true
argument-hint: "[description]"
allowed-tools:
  - Read
  - Write
  - Bash
description: Quick-capture a new task
---

# plan-capture

Quickly capture a task idea with minimal friction. The goal is fast capture — elaboration comes later.

## Arguments

- `$ARGUMENTS`: Optional task description (e.g., "Fix login timeout bug")

## Steps

1. **Verify initialization**
   - Check for `.plans/config.json`
   - If not found, error: "Not initialized. Run `/plan-init` first."

2. **Get task description**
   - If `$ARGUMENTS` provided, use it as the description
   - If no arguments, ask: "What task do you want to capture?"

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
   ```
   Captured task #NNN: [Title]
   Type: [type] | Status: pending
   File: .plans/pending/NNN-slug.md

   Next: /plan-elaborate NNN to flesh it out
   ```

## Edge Cases

- **No description provided**: Ask the user for one
- **Corrupt config.json**: Reconstruct `next_id` by finding highest ID in pending/ and completed/ directories, then add 1
- **ID collision** (file already exists): Scan directories for actual max ID and use that + 1
- **Very long description**: Truncate slug at word boundary, keep full description in the file
