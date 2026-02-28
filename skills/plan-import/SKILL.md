---
name: plan-import
disable-model-invocation: true
argument-hint: "<path-to-markdown-file>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - AskUserQuestion
description: Import a brainstorming document and split into multiple tasks
---

# plan-import

Import a brainstorming or planning markdown document and split it into multiple individual tasks. Analyzes the document structure, proposes a split, and creates tasks after user confirmation.

## Arguments

- `$ARGUMENTS`: Path to a markdown file to import (e.g., "brainstorm.md", "./docs/roadmap.md")

## Steps

1. **Verify initialization**
   - Check for `.plans/config.json`
   - If not found, error: "Not initialized. Run `/plan-init` first."

2. **Parse arguments**
   - `$ARGUMENTS` should contain a file path
   - If no arguments provided, ask: "What file would you like to import?"
   - Validate the file exists and is readable

3. **Read and analyze the document**
   - Read the markdown file content
   - Identify structure indicators that suggest task boundaries:
     - **Headers**: H1 (`#`), H2 (`##`), H3 (`###`) as section boundaries
     - **Numbered lists**: "1.", "2.", etc. for sequential steps/phases
     - **Phase markers**: "Phase 1:", "Step 1:", "Part 1:", "Stage 1:"
     - **Sequence words**: "First,", "Next,", "Then,", "Finally,"
     - **Section dividers**: `---`, `===`, `***`
     - **Checkbox lists**: `- [ ]` items that could be individual tasks

4. **Extract potential tasks**
   For each identified section/boundary:
   - **Title**: From the header text or first line
   - **Description**: Content under the header/section
   - **Type**: Infer from keywords:
     - `bug`: "fix", "bug", "broken", "error", "issue", "crash", "fail"
     - `feature`: "add", "new", "implement", "create", "support"
     - `refactor`: "refactor", "clean", "reorganize", "restructure", "improve"
     - `chore`: "update", "upgrade", "config", "setup", "docs", "test"
     - Default to "feature" if no keywords match
   - **Sequence**: Note if tasks appear sequential (phases) for dependency awareness

5. **Present proposal to user**
   Display the import proposal clearly:
   ```
   ## Import Proposal

   **Source:** [filename]
   **Found:** [N] potential tasks

   | # | Title | Type | Preview |
   |---|-------|------|---------|
   | 1 | [title] | [type] | [first 50 chars of description]... |
   | 2 | [title] | [type] | [first 50 chars of description]... |
   ...

   ### Task Details

   #### 1. [Title] ([type])
   [Full description from document]

   #### 2. [Title] ([type])
   [Full description from document]

   ...

   ---
   **Options:**
   - Reply "yes" or "all" to create all tasks
   - Reply with numbers to create specific tasks (e.g., "1,3,5")
   - Reply "no" or "cancel" to abort
   ```

6. **Wait for user confirmation**
   - Accept: "yes", "y", "all", "ok", "confirm"
   - Partial: comma-separated numbers like "1,3" or "1, 2, 4"
   - Reject: "no", "n", "cancel", "abort"

7. **Create approved tasks**
   For each approved task:
   - Read current `next_id` from `.plans/config.json`
   - Generate slug from title (lowercase, hyphens, max 40 chars)
   - Create task file at `.plans/pending/NNN-slug.md`:
     ```markdown
     # [Title]

     **ID:** [NNN]
     **Created:** [YYYY-MM-DDTHH:MM]
     **Type:** [type]
     **Status:** pending
     **Source:** Imported from [original filename]

     ## What
     [Description from the source document]

     ## Why
     _To be filled during elaboration_

     ## How
     _To be filled during elaboration_

     ## Verification
     _To be filled during elaboration_

     ## Changes
     _To be filled during execution_

     ## Notes
     _Imported from [filename]_
     ```
   - Increment `next_id` in config.json after each task

8. **Update PROGRESS.md**
   - Add note about import in the activity section
   - Update task counts

9. **Display summary**
   ```
   ## Import Complete

   Created [N] tasks from [filename]:

   | ID | Title | Type | Status |
   |----|-------|------|--------|
   | #001 | [title] | [type] | pending |
   | #002 | [title] | [type] | pending |
   ...

   **Next steps:**
   - `/plan-elaborate [first-id]` to flesh out the first task
   - `/plan-list` to see all pending tasks
   - `/plan-status` for full dashboard
   ```

## Edge Cases

- **No arguments**: Ask user for the file path
- **File not found**: Error with the exact path tried: "File not found: [path]. Check the path and try again."
- **File not readable**: Error: "Cannot read file: [path]. Check permissions."
- **Empty file**: Error: "File is empty: [path]"
- **No clear structure**: If document has no identifiable boundaries:
  - Offer to create a single task with entire content as description
  - Ask: "No clear task boundaries found. Create one task with the full content?"
- **Very long sections**: Truncate preview in proposal table, keep full content in task file
- **Duplicate titles**: If a proposed task title matches an existing task, note it: "[title] (note: similar to existing #NNN)"
- **Not initialized**: Error: "Not initialized. Run `/plan-init` first."
- **User cancels**: Confirm: "Import cancelled. No tasks created."
- **Partial selection with invalid numbers**: Ignore invalid numbers, create valid ones, note which were skipped
