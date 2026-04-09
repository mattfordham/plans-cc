---
name: plan-expand
disable-model-invocation: true
argument-hint: "<idea-id>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - AskUserQuestion
description: Expand an idea into actionable tasks through guided discussion
---

# plan-expand

Expand a brainstorm idea into well-scoped, actionable tasks. Unlike `/plan-import` (which structurally parses any markdown file), this skill reads an idea document holistically — understanding its context, insights, decisions, and open questions — then proposes a thoughtful decomposition into tasks through interactive discussion.

## Arguments

- `$ARGUMENTS`: Idea ID (flexible format: "1", "01", "001")

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Parse and find idea file**
   - If no `$ARGUMENTS` provided, ask: "Which idea do you want to expand? (provide the idea ID)"
   - Normalize the ID to 3-digit zero-padded format (e.g., "1" → "001")
   - Search `.plans/ideas/` for a file matching `NNN-*.md`
   - If not found, error: "Idea #NNN not found. Run `/plan-brainstorm` to create ideas, or check `.plans/ideas/` for available ideas."

3. **Check for previous expansion**
   - Read the idea file
   - If it contains an `## Expanded Into` section, use AskUserQuestion:
     ```
     question: "Idea #NNN has already been expanded into tasks. What would you like to do?"
     header: "Re-expand"
     options:
       - label: "Add more tasks"
         description: "Keep existing tasks and create additional ones"
       - label: "Start fresh"
         description: "Ignore previous expansion and propose new tasks"
       - label: "Cancel"
         description: "Nothing to do here"
     ```
   - If "Cancel", stop with: "No changes made."

4. **Analyze idea content**
   - Read the full idea document
   - Identify and understand:
     - **Context**: What prompted the exploration
     - **Key Insights**: Important realizations
     - **Decisions & Conclusions**: Firm choices made
     - **Open Questions**: Unresolved items
     - **Notes**: Additional context
   - Also read `.plans/CONTEXT.md` if it exists, for project-level awareness

5. **Synthesize task candidates**
   Apply scoping heuristics to decompose the idea into tasks:

   **Split when:**
   - Multiple independent decisions were made (each becomes a task)
   - Work spans unrelated areas of the codebase
   - There are natural phases (setup → implementation → migration)
   - The idea mixes different task types (bug fix + feature + refactor)

   **Merge when:**
   - Changes affect the same component and are tightly coupled
   - Individual pieces are too small to stand alone (< 1 session)
   - One change is meaningless without another

   **For each task candidate, determine:**
   - Title (clear, action-oriented)
   - Type (bug/feature/refactor/chore — use same keywords as `/plan-capture`)
   - What it covers (which insights/decisions it addresses)
   - Suggested sequence (if tasks have natural ordering)

6. **Present proposal**
   Display the expansion proposal with reasoning:

   ```
   ## Expansion Proposal for Idea #NNN: [Topic]

   Based on the brainstorm, I'm proposing [N] tasks:

   | # | Title | Type | Covers |
   |---|-------|------|--------|
   | 1 | [title] | [type] | [which insights/decisions this addresses] |
   | 2 | [title] | [type] | [which insights/decisions this addresses] |
   ...

   ### Reasoning
   - [Why this decomposition makes sense]
   - [Sequencing notes if applicable]
   - [What was merged or split and why]
   ```

7. **Interactive refinement**
   Use AskUserQuestion to let the user refine the proposal:

   ```
   question: "How does this breakdown look?"
   header: "Refine"
   options:
     - label: "Looks good"
       description: "Create these tasks as proposed"
     - label: "Adjust tasks"
       description: "I want to add, remove, merge, or re-scope tasks"
     - label: "Completely different"
       description: "Start over with a different approach"
     - label: "Cancel"
       description: "Don't create any tasks"
   ```

   If "Adjust tasks": Ask what specific changes they want (add, remove, merge, re-scope, change type). Apply changes and present updated proposal. Repeat until satisfied.

   If "Completely different": Ask what approach they'd prefer and generate a new proposal.

   If "Cancel": Stop with "No tasks created."

8. **Resolve critical open questions**
   - If the idea has Open Questions that would affect task scoping, use AskUserQuestion to resolve them before creating tasks
   - Only resolve questions that impact which tasks to create or their scope
   - Defer implementation details to the elaboration phase
   - Example:
     ```
     question: "The brainstorm noted an open question: '[question]'. This affects how we scope the tasks. What's your thinking?"
     header: "Open Q"
     options:
       - label: "[Option A]"
         description: "[How this affects task scope]"
       - label: "[Option B]"
         description: "[How this affects task scope]"
       - label: "Defer"
         description: "Handle during elaboration"
     ```

9. **Create tasks**
   For each approved task:
   - Read current `next_id` from `.plans/config.json`
   - Generate slug from title (lowercase, hyphens, remove special chars, max 40 chars at word boundary)
   - Create task file at `.plans/pending/NNN-slug.md`:
     ```markdown
     # [Title]

     **ID:** [NNN]
     **Created:** [YYYY-MM-DDTHH:MM]
     **Type:** [type]
     **Status:** pending
     **Source:** Expanded from idea #[idea-NNN]

     ## What
     [Description synthesized from the idea's relevant insights and decisions]

     ## Why
     _To be filled during elaboration_

     ## How
     _To be filled during elaboration_

     ## Verification
     _To be filled during elaboration_

     ## Changes
     _To be filled during execution_

     ## Notes
     _Expanded from idea #[idea-NNN]: [idea topic]_
     ```
   - Increment `next_id` in config.json after each task

10. **Update idea file**
    - Append an `## Expanded Into` section to the idea file (or update existing if re-expanding):
      ```markdown
      ## Expanded Into
      - Task #[NNN]: [Title]
      - Task #[NNN]: [Title]
      ...
      ```

11. **Update PROGRESS.md**
    - Update task counts in the Stats section
    - Add activity note: "Expanded idea #NNN into N tasks"

12. **Commit .plans/ changes**
    - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
    - If not a git repo: skip silently
    - Read `.plans/config.json` for `git_commits` setting
    - If `git_commits` is not `true`: skip silently
    - Check for uncommitted changes in .plans/: `git status --porcelain .plans/`
    - If no changes: skip silently
    - Commit:
      ```bash
      git add .plans/
      git commit -m "plan: expand idea #NNN into [N] tasks"
      ```
    - If commit fails (e.g. hooks): warn but do not fail the skill

13. **Display summary**
    ```
    ## Expansion Complete

    Expanded idea #[NNN] ([Topic]) into [N] tasks:

    | ID | Title | Type | Status |
    |----|-------|------|--------|
    | #[NNN] | [title] | [type] | pending |
    | #[NNN] | [title] | [type] | pending |
    ...

    **Next steps:**
    - `/plan-elaborate [first-id]` to flesh out the first task
    - `/plan-list` to see all pending tasks
    - `/plan-status` for full dashboard
    ```

## Edge Cases

- **No arguments**: Ask user for the idea ID
- **Idea not found**: Error with helpful message listing available ideas if any exist in `.plans/ideas/`
- **Empty idea file**: Error: "Idea #NNN appears to be empty. Run `/plan-brainstorm` to create a populated idea."
- **Idea with no actionable content**: If the idea is purely exploratory with no decisions or clear direction, suggest the user brainstorm further: "This idea doesn't have enough concrete direction to expand into tasks yet. Consider running `/plan-brainstorm` again to develop it further."
- **Single task result**: That's fine — not every idea needs multiple tasks. Present it the same way.
- **Many tasks proposed (8+)**: Warn the user: "This is a lot of tasks. Consider whether some could be combined or deferred." Let them decide.
- **Already expanded — "Add more"**: Read existing Expanded Into section, note which tasks already exist, propose only new/additional tasks. Append new entries to the Expanded Into section.
- **Already expanded — "Start fresh"**: Warn that existing tasks won't be deleted, but the Expanded Into section will be replaced. Proceed with fresh analysis.
- **config.json missing next_id**: Reconstruct by finding highest ID in pending/ and completed/ directories, then add 1
- **ideas/ directory doesn't exist**: Error: "No ideas directory found. Run `/plan-brainstorm` to create ideas first."
