---
name: plan-pick
disable-model-invocation: true
argument-hint: "<idea-id>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - AskUserQuestion
description: Pick components from an idea to create tasks (selective expand)
---

# plan-pick

Analyze an idea, surface the highest-value components, and let the user select which ones to turn into tasks. Unlike `/plan-expand` (which proposes a full decomposition of the entire idea), this skill ranks components by priority and ROI, presents them as a multi-select, and only creates tasks for the chosen items. The idea file is updated to track what's been picked, so the user can return later to pick more.

## Arguments

- `$ARGUMENTS`: Idea ID (flexible format: "1", "01", "001")

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Parse and find idea file**
   - If no `$ARGUMENTS` provided, ask: "Which idea do you want to pick from? (provide the idea ID)"
   - Normalize the ID to 3-digit zero-padded format (e.g., "1" → "001")
   - Search `.plans/ideas/` for a file matching `NNN-*.md`
   - If not found, error: "Idea #NNN not found. Run `/plan-ideas` to see available ideas."

3. **Read idea and project context**
   - Read the full idea file
   - Read `.plans/CONTEXT.md` if it exists, for project-level awareness
   - If idea file has a `## Picked` section, note which components have already been picked (these will be shown as already picked, not re-offered)

4. **Analyze and rank components**

   Break the idea into discrete, actionable components. Derive these from:
   - **Key Insights** — each insight often implies work
   - **Decisions & Conclusions** — firm choices that need implementing
   - **Open Questions** — resolved questions may reveal work; unresolved ones may suggest spikes/research tasks

   For each component, assess:
   - **Priority**: How critical is this? (high / medium / low)
   - **Effort**: How much work? (small / medium / large)
   - **Value**: What's the bang for the buck? Combine priority and effort into a simple ROI signal
   - **Dependencies**: Does this need to come before other components?

   Sort components by value (highest first): high-priority/small-effort at top, low-priority/large-effort at bottom.

5. **Present ranked components**

   Display a summary table, then use AskUserQuestion with multi-select:

   ```
   ## Idea #NNN: [Topic] — Component Analysis

   | # | Component | Priority | Effort | Value |
   |---|-----------|----------|--------|-------|
   | 1 | [Component name] | high | small | ★★★ |
   | 2 | [Component name] | high | medium | ★★☆ |
   | 3 | [Component name] | medium | small | ★★☆ |
   | 4 | [Component name] | low | large | ★☆☆ |

   [If any already picked:]
   Already picked: [Component A], [Component B]
   ```

   Then prompt with AskUserQuestion using one option per component:

   ```
   question: "Which components do you want to turn into tasks? Select one or more."
   header: "Pick"
   options:
     - label: "1. [Component name]"
       description: "[Priority] priority · [Effort] effort — [One-line summary of what this involves]"
     - label: "2. [Component name]"
       description: "[Priority] priority · [Effort] effort — [One-line summary]"
     - label: "3. [Component name]"
       description: "[Priority] priority · [Effort] effort — [One-line summary]"
     ...
   ```

   **Multi-select behavior:** The user can select multiple options. Each selected option becomes a task. If only one is selected, that's fine too.

6. **Confirm selection**

   After the user selects, summarize what will be created:

   ```
   Creating N tasks from idea #NNN:

   1. [Component name] → "[Task title]" (type)
   2. [Component name] → "[Task title]" (type)
   ```

   Use AskUserQuestion:
   ```
   question: "Create these tasks?"
   header: "Confirm"
   options:
     - label: "Yes, create them"
       description: "Create N new tasks"
     - label: "Change selection"
       description: "Go back and pick different components"
     - label: "Cancel"
       description: "Don't create any tasks"
   ```

   - If "Change selection": return to step 5
   - If "Cancel": stop with "No tasks created."

7. **Create tasks**

   For each selected component:
   - Read current `next_id` from `.plans/config.json`
   - Generate a clear, action-oriented title from the component
   - Infer task type using the same keyword rules as `/plan-capture`:
     - **bug**: fix, bug, broken, error, issue, crash, fail
     - **feature**: add, new, implement, create, support
     - **refactor**: refactor, clean, reorganize, restructure, improve
     - **chore**: update, upgrade, config, setup, docs, test
     - Default to "feature" if no keywords match
   - Slugify the title (lowercase, hyphens, remove special chars, max 40 chars at word boundary)
   - Create task file at `.plans/pending/NNN-slug.md`:

     ```markdown
     # [Title]

     **ID:** [NNN]
     **Created:** [YYYY-MM-DDTHH:MM]
     **Type:** [type]
     **Status:** pending
     **Source:** Picked from idea #[idea-NNN]

     ## What
     [Description synthesized from the component's context within the idea — include relevant insights, decisions, and constraints]

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
     _Picked from idea #[idea-NNN]: [idea topic]_
     ```

   - Increment `next_id` in config.json after each task

8. **Update idea file**

   Add or update a `## Picked` section in the idea file. This tracks what's been picked so the user can return for more later.

   **If no `## Picked` section exists**, append:
   ```markdown
   ## Picked
   - Task #[NNN]: [Title] ([YYYY-MM-DD])
   - Task #[NNN]: [Title] ([YYYY-MM-DD])
   ```

   **If `## Picked` section already exists**, append new entries to it:
   ```markdown
   - Task #[NNN]: [Title] ([YYYY-MM-DD])
   ```

   Also update the `## Expanded Into` section (same as `/plan-expand` does) so that `/plan-ideas` correctly shows the idea as expanded:

   **If no `## Expanded Into` section exists**, append:
   ```markdown
   ## Expanded Into
   - Task #[NNN]: [Title]
   - Task #[NNN]: [Title]
   ```

   **If `## Expanded Into` section already exists**, append new entries to it.

9. **Update PROGRESS.md**
   - Update task counts in the Stats section
   - Add activity note: "Picked N components from idea #NNN"

10. **Commit .plans/ changes**
    - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
    - If not a git repo: skip silently
    - Check if `.plans/` is gitignored: `git check-ignore -q .plans/ 2>/dev/null`
    - If exit code 0 (ignored): skip silently
    - Read `.plans/config.json` for `git_commits` setting
    - If `git_commits` is not `true`: skip silently
    - Check for uncommitted changes in .plans/: `git status --porcelain .plans/`
    - If no changes: skip silently
    - Commit:
      ```bash
      git add .plans/
      git commit -m "plan: pick from idea #NNN"
      ```
    - If commit fails (e.g. hooks): warn but do not fail the skill

11. **Display summary**

    ```
    ## Picked from Idea #NNN: [Topic]

    Created N tasks:

    | ID | Title | Type |
    |----|-------|------|
    | #[NNN] | [title] | [type] |
    | #[NNN] | [title] | [type] |

    Remaining unpicked components: N

    Next steps:
    - /plan-elaborate [first-id] to flesh out the first task
    - /plan-pick NNN to pick more components later
    - /plan-ideas NNN to review the full idea
    ```

    If all components have now been picked:
    ```
    All components from this idea have been picked. 🎉
    ```

## Edge Cases

- **No arguments**: Ask user for the idea ID
- **Idea not found**: Error with helpful message, suggest `/plan-ideas` to browse
- **Empty idea file**: Error: "Idea #NNN appears to be empty. Run `/plan-brainstorm` to create a populated idea."
- **Idea with no actionable components**: "This idea doesn't have enough concrete content to pick from. Consider running `/plan-brainstorm` again to develop it further."
- **All components already picked**: "All components from idea #NNN have already been picked. Run `/plan-ideas NNN` to review, or `/plan-brainstorm` to explore further."
- **Single component in idea**: Still show the selection prompt (consistent UX), but note there's only one component
- **User selects nothing**: Treat as cancel — "No tasks created."
- **ideas/ directory doesn't exist**: Error: "No ideas directory found. Run `/plan-brainstorm` to create ideas first."
- **config.json missing next_id**: Reconstruct by finding highest ID in pending/ and completed/ directories, then add 1
