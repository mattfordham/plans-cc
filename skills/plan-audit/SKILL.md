---
name: plan-audit
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Task
  - AskUserQuestion
description: Audit a task's completeness — verify all affected files and tests
---

# plan-audit

Run a completeness audit on a task. Verifies that all affected files, tests, and cross-cutting concerns are accounted for. Useful before execution, mid-execution, or before completion — especially for multi-file and cross-repo tasks.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001")

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Parse and resolve task ID**
   - Accept flexible ID formats: "1", "01", "001"
   - Zero-pad to 3 digits for file lookup
   - Find task file in `.plans/pending/NNN-*.md` or `.plans/completed/NNN-*.md`

3. **Validate task state**
   - Read the task file
   - Check Status field:
     - If `elaborated`, `in-progress`, or `review`: proceed
     - If `pending`: "Task #NNN hasn't been elaborated yet. Run `/plan-elaborate NNN` first."
     - If `completed`: "Task #NNN is completed. Run `/plan-reopen NNN` first to audit."
     - If not found: "Task #NNN not found. Run `/plan-list` to see available tasks."

4. **Extract task scope**
   - Parse the task file for:
     - **How section**: all steps and file references
     - **Impact Scope section** (if present): files to modify, related files
     - **Changes section**: files already modified (if in-progress)
   - Collect all file paths mentioned across these sections

5. **Spawn audit agent**
   Use the Task tool to spawn an Explore agent:

   ```
   Task tool parameters:
   - subagent_type: "Explore"
   - description: "Audit task #NNN completeness"
   - prompt: |
       Audit the completeness of this task implementation plan.

       ## Task
       [Task title and full How section]

       ## Known Files
       [All file paths extracted from How, Impact Scope, and Changes sections]

       ## What to Audit
       1. Verify each listed file exists in the codebase
       2. For files already modified (Changes section): confirm the changes are present
       3. Find RELATED files that also likely need changes:
          - Type definitions, interfaces, or schemas imported by modified files
          - Test files for each modified file
          - Files that import or depend on modified files
          - UI components that render data from modified files
          - API routes or controllers that serve modified data
          - Configuration files that reference modified modules
       4. Check for cross-repo or cross-package impact (monorepo packages, shared libraries)

       ## Return Format
       ### Verified Files
       - `path/to/file` — Exists ✓ [and modified ✓ if in-progress]

       ### Missing Files
       - `path/to/file` — Referenced in plan but does not exist

       ### Related Files Needing Updates
       - `path/to/related` — [Why: imports modified file / contains tests / defines types]

       ### Cross-Repo Impact
       - [package or repo] — [What might need updating]
       (or "None detected")
   ```

6. **Present audit results**

   Display findings organized by status:

   ```
   Audit for task #NNN: [Title]

   Verified (N files):
   ✓ path/to/file1 — exists [and modified]
   ✓ path/to/file2 — exists [and modified]

   Missing (N files):
   ✗ path/to/missing — referenced in plan but not found

   Related Files Needing Updates (N files):
   ! path/to/test — test file for modified module
   ! path/to/types — type definitions imported by modified file

   Cross-Repo Impact:
   ⚠ [package] — [what might need updating]
   ```

7. **Offer to update task**

   If related files or missing files were found, use AskUserQuestion:
   ```
   question: "The audit found N files that may need attention. Would you like to update the task?"
   header: "Update task"
   options:
     - label: "Add as How steps"
       description: "Add missing/related files as new steps in the How section"
     - label: "Add to Impact Scope"
       description: "Add to Impact Scope for tracking without new steps"
     - label: "No changes"
       description: "I'll handle these manually"
   ```

   - If "Add as How steps": append new unchecked steps to the How section for each related/missing file
   - If "Add to Impact Scope": add to the Related Files subsection of Impact Scope (create Impact Scope if it doesn't exist)
   - If "No changes": display results only, make no modifications

8. **Display summary**
   ```
   Audit complete for task #NNN

   Verified: N | Missing: N | Related: N | Cross-repo: N

   [If changes were made]: Task updated with N new [steps/Impact Scope entries].
   [If no changes]: No changes made to task file.
   ```

## Edge Cases

- **No ID argument**: List elaborated/in-progress tasks and ask which to audit
- **Task has no How section**: "Task #NNN has no implementation steps. Run `/plan-elaborate NNN` first."
- **All files verified, no related files found**: "Audit complete — task scope looks comprehensive."
- **Task tool unavailable**: Fall back to direct Glob/Grep research in main conversation
- **Cross-repo files detected**: Note them but don't attempt to modify files outside the current repo
- **Very large task (20+ files)**: Still audit, but group results by directory for readability
