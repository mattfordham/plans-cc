---
name: plan-elaborate
disable-model-invocation: true
argument-hint: "<id|description> [skip]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - WebFetch
  - WebSearch
  - AskUserQuestion
description: Research and flesh out a task (auto-captures if given a description)
---

# plan-elaborate

Research the codebase and flesh out a captured task with implementation details. If given a description instead of an ID, auto-captures the task first.

## Arguments

- `$ARGUMENTS`: One or more task IDs, OR a task description, optionally followed by a skip keyword

**Parsing rules:**
- **Skip detection** (first) — set `skip_mode = true` if `$ARGUMENTS` contains any of:
  - Single keywords (per-token, case-insensitive): `skip`, `auto`, `noprompt`, `noinput`
  - Phrases (matched against full argument string, case-insensitive): `skip input`, `no input`, `no prompts`, `just go`, `just do it`
  - Strip skip keywords/phrases from `$ARGUMENTS` before further parsing
- **Determine argument type** — after removing skip tokens, examine what remains:
  - If ALL remaining tokens are numeric → task IDs. Zero-pad each to 3 digits. Deduplicate.
  - If ANY remaining token is non-numeric → the entire remaining string (including any numbers) is a **task description** for auto-capture. Set `auto_capture = true`.
  - If nothing remains → no IDs and no description (will prompt for IDs)
- IDs and skip keywords coexist freely.
- A description and skip keywords coexist freely.

**Examples:**
- `/plan-elaborate 1` → elaborate task 1, interactive
- `/plan-elaborate 1 3 5` → elaborate tasks 1, 3, 5 sequentially, interactive
- `/plan-elaborate 1 skip` → elaborate task 1, skip all prompts
- `/plan-elaborate 1 3 5 just go` → elaborate tasks 1, 3, 5, skip all prompts
- `/plan-elaborate skip` → skip mode, but no IDs — will prompt for IDs
- `/plan-elaborate auto` → same as skip
- `/plan-elaborate Fix login timeout bug` → auto-capture "Fix login timeout bug", then elaborate
- `/plan-elaborate Add dark mode skip` → auto-capture "Add dark mode", then elaborate in skip mode

## Context

Reference `.plans/CONTEXT.md` to understand the project's tech stack, patterns, and key files when researching.

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Parse and resolve arguments**
   - Check for skip keywords/phrases (see Arguments section) → store as `skip_mode` flag (true/false)
   - Strip skip keywords/phrases from `$ARGUMENTS`
   - Examine remaining tokens:
     - If ALL remaining tokens are numeric → task IDs. Zero-pad each to 3 digits, deduplicate → store as `task_ids` list. Set `auto_capture = false`.
     - If ANY remaining token is non-numeric → the entire remaining string is a task description. Set `auto_capture = true`. Store as `capture_description`.
     - If nothing remains → `task_ids` is empty, `auto_capture = false`

3. **Auto-capture** (only if `auto_capture` is true)

   Print: `--- Auto-capturing task: [capture_description] ---`

   Read `skills/plan-capture/SKILL.md` and follow its steps 1–8 (capture only, no auto-proceed chaining) using `capture_description` as the task description:
   - Verify initialization, generate ID, slugify, infer type, write task file, update config, update PROGRESS.md
   - Store the newly created task ID

   Show brief confirmation:
   ```
   Captured task #NNN: [Title]
   Type: [type] | Status: pending
   ```

   Set `task_ids` to the single newly captured ID. Continue to step 4.

   **If capture fails** (e.g., config error):
   - Print error: `Auto-capture failed: [reason]`
   - STOP — do not proceed with elaboration

4. **Handle missing IDs**
   - If `task_ids` is empty (no `$ARGUMENTS`, no numeric tokens, and no auto-capture), list pending tasks and ask which to elaborate:
     ```
     Pending tasks:
     #001 - Fix login timeout bug (pending)
     #002 - Add dark mode (pending)
     #003 - Refactor auth (elaborated)

     Which task ID(s) to elaborate? (space-separated for multiple)
     ```
   - Parse the user's response for numeric IDs the same way as step 2
   - If `skip_mode` was already set from original args (e.g., `/plan-elaborate skip`), retain it after user provides IDs

5. **Begin multi-task elaboration**

   Wrap steps 6–15 in a per-task loop over `task_ids`:

   - Show progress header for each task:
     ```
     --- Elaborating task [X] of [N]: #NNN ---
     ```
   - If `skip_mode`: announce once at the start: `Skip mode active — auto-accepting all prompts.`
   - On fatal error per task (not found, already completed): log warning `Skipping #NNN: [reason]`, continue to next task
   - Track results in two lists: `elaborated_tasks` (succeeded), `skipped_tasks` (failed/skipped with reason)

   **For each task in `task_ids`, execute steps 6–15:**

6. **Validate task state**
   - Read the task file from `.plans/pending/NNN-*.md`
   - Check Status field:
     - If `pending`: proceed with initial elaboration
     - If `elaborated` or `in-progress`: proceed with **further elaboration** (see step 11, Path C)
     - If `completed`: log `Skipping #NNN: already completed. Run /plan-reopen NNN first.` and continue to next task
     - If not found: log `Skipping #NNN: not found. Run /plan-list to see available tasks.` and continue to next task

7. **Load project context**
   - Read `.plans/CONTEXT.md`
   - Note tech stack, key patterns, important files
   - Prepare a brief context summary for the research agent

8. **Spawn research sub-agent**
   Use the Task tool to spawn an Explore agent for codebase research:

   ```
   Task tool parameters:
   - subagent_type: "Explore"
   - description: "Research task #NNN"
   - prompt: |
       Research this task for a plans-cc elaboration:

       ## Task
       [Task title and What section]

       ## Project Context
       [Brief summary from CONTEXT.md: tech stack, key patterns]

       ## What to Find
       1. Relevant files that would need to be modified or referenced
       2. Current implementation patterns for similar functionality
       3. Suggested approach based on codebase conventions
       4. Any open questions or unclear areas
       5. Existing utilities, hooks, helpers, or modules that already handle part of this task — flag anything reusable
       6. Anti-patterns to avoid: previous attempts, deprecated approaches, common pitfalls

       ## Return Format
       Return your findings in this structure:

       ### Relevant Files
       - `path/to/file` — Why it's relevant

       ### Current Implementation
       Brief summary of how related functionality currently works

       ### Suggested Approach
       Recommended implementation steps based on what you found

       ### Reusable Existing Code
       - `path/to/util` — What it does and how it applies
       (or "None found")

       ### Approach Warnings
       - [Concerns about over-engineering or simpler alternatives]
       (or "None")

       ### Open Questions
       Anything unclear that needs user input
   ```

   **Fallback:** If Task tool is unavailable, fall back to direct research using Glob, Grep, and Read in the main conversation.

9. **Process research findings**
   - Parse the sub-agent's structured response
   - Use "Relevant Files" to identify scope
   - Use "Suggested Approach" to draft the How section
   - Review "Reusable Existing Code" — simplify How steps to use existing code instead of creating new abstractions
   - Surface any "Approach Warnings" to the user before finalizing the approach
   - Note "Open Questions" for user discussion

10. **Assess task simplicity**

   Evaluate whether the task is simple enough for auto-generation:

   **Task is SIMPLE if ALL are true:**
   - Research found ≤3 files to modify
   - Research "Suggested Approach" has ≤4 steps
   - Research "Open Questions" section is empty or absent
   - Task description is specific (mentions file, function, or config name)

   **Task is NOT simple if ANY are true:**
   - Task type is `refactor`
   - Research has open questions that need user input
   - Description contains: "investigate", "figure out", "explore", "design", "architecture"

11. **Fill out task sections (conditional flow)**

    Use `AskUserQuestion` for all user input. Never output questions as plain text.

    ---

    ### Path A: Simple Task (auto-generate with single confirmation)

    If task is simple (per step 10 criteria):

    1. **Auto-generate Why** based on task type:
       - Bug: "Improves reliability by fixing [specific issue from description]"
       - Feature: "Adds value by enabling [capability from description]"
       - Chore: "Maintains project health by [action from description]"

    2. **Auto-generate How** by converting research "Suggested Approach" directly to checkboxes:
       ```markdown
       ## How
       - [ ] Step 1: [First step from Suggested Approach]
       - [ ] Step 2: [Second step from Suggested Approach]
       ...
       ```

       **Tag observation steps** with `👁` (see tagging rules below).

    3. **Auto-generate Verification** based on task type:
       - Bug: "Verify the issue no longer occurs; existing tests pass"
       - Feature: "Verify the new functionality works as expected; tests pass"
       - Chore: "Verify the change is applied correctly; no regressions"

    4. **Show single confirmation prompt**:

       **Skip mode shortcut:** If `skip_mode` is true, auto-select "Yes, proceed" and continue without calling `AskUserQuestion`.

       ```
       question: "This looks straightforward. Proceed with these defaults?"
       header: "Quick"
       options:
         - label: "Yes, proceed"
           description: "Use auto-generated Why/How/Verification"
         - label: "Let me review"
           description: "Walk through each section interactively"
       ```

    - If "Yes, proceed": Skip to step 12 (Validate How steps)
    - If "Let me review": Fall through to Path B below

    ---

    ### Path B: Complex Task (full interactive flow)

    If task is complex OR user chose "Let me review":

    **Why section:**

    **Skip mode shortcut:** If `skip_mode` is true, auto-select the first option (suggested purpose) and continue without calling `AskUserQuestion`.

    Use AskUserQuestion with options based on task type:
    ```
    question: "Why is this task important?"
    header: "Purpose"
    options:
      - label: "[Suggested purpose based on research]"
        description: "Based on codebase analysis"
      - label: "Different reason"
        description: "I'll explain the purpose"
    ```
    - Bug tasks: Suggest "Improves reliability by fixing [specific issue]"
    - Feature tasks: Suggest "Adds value by enabling [capability]"
    - Refactor tasks: Suggest "Improves maintainability by [improvement]"

    **How section (with checkboxes):**
    First, present research findings as a brief summary (not questions):
    ```
    Research findings:
    - Relevant files: [list from sub-agent]
    - Current patterns: [brief summary]
    - Suggested approach: [numbered steps]
    ```

    **Skip mode shortcut:** If `skip_mode` is true, auto-select "Yes, proceed" and continue without calling `AskUserQuestion`.

    Then use AskUserQuestion for approach confirmation:
    ```
    question: "Does this implementation approach look correct?"
    header: "Approach"
    options:
      - label: "Yes, proceed"
        description: "Use the suggested approach as-is"
      - label: "Modify approach"
        description: "I have changes to suggest"
      - label: "Different approach"
        description: "I want to take a different direction"
    ```

    If there are open questions from research, ask them via AskUserQuestion:

    **Skip mode shortcut:** If `skip_mode` is true, auto-select the first option for each question and continue without calling `AskUserQuestion`.

    ```
    question: "[Specific technical question, e.g., 'Should the association be optional?']"
    header: "Design"
    options:
      - label: "[Option A]"
        description: "[Explanation of option A]"
      - label: "[Option B]"
        description: "[Explanation of option B]"
    ```

    Document the agreed approach as **checkbox items**:
    ```markdown
    ## How
    - [ ] Step 1: Description of first task
    - [ ] 👁 Step 2: Add logging and run app to observe output
    - [ ] Step 3: Description of third task
    ```
    - Each checkbox should be a concrete, completable action
    - Aim for 3-7 checkboxes per task (break down large tasks, combine trivial ones)
    - Include file paths where relevant: `- [ ] Update timeout handling in \`src/auth/login.ts\``
    - **Tag observation steps** with `👁` (see tagging rules below)

    **Verification section:**

    **Skip mode shortcut:** If `skip_mode` is true, auto-select the first option (suggested verification) and continue without calling `AskUserQuestion`.

    Use AskUserQuestion for verification criteria:
    ```
    question: "How should we verify this task is complete?"
    header: "Verify"
    options:
      - label: "[Suggested verification based on task type]"
        description: "[Details of suggested verification]"
      - label: "Different criteria"
        description: "I'll specify verification steps"
    ```
    - Bug: Suggest "Verify the [issue] no longer occurs when [trigger]"
    - Feature: Suggest "Verify [capability] works by [test steps]"
    - Refactor: Suggest "Verify existing tests pass, code is cleaner"

    ---

    ### Path C: Further Elaboration (task already elaborated or in-progress)

    If task status is `elaborated` or `in-progress`:

    1. **Show current state:**
       ```
       Task #NNN: [Title]
       Status: [elaborated/in-progress]

       Current steps:
       - [x] Step 1: Already completed step
       - [x] Step 2: Another completed step
       - [ ] Step 3: Pending step
       - [ ] Step 4: Another pending step

       What would you like to add or change?
       ```

    2. **Use AskUserQuestion to determine intent:**

       **Skip mode shortcut:** If `skip_mode` is true, auto-select "Research more" and continue without calling `AskUserQuestion`. After spawning the research agent, auto-accept its findings.

       ```
       question: "What additional elaboration do you need?"
       header: "Elaborate"
       options:
         - label: "Add more steps"
           description: "Add new steps to the How section"
         - label: "Refine existing steps"
           description: "Break down or clarify existing steps"
         - label: "Update verification"
           description: "Change how completion is verified"
         - label: "Research more"
           description: "Spawn research agent for additional context"
       ```

    3. **Based on user selection:**

       **If "Add more steps":**
       - Ask what additional work is needed
       - Append new unchecked steps to the How section (after existing steps)
       - Keep all existing checkboxes in their current state

       **If "Refine existing steps":**
       - Show numbered list of current incomplete steps
       - Ask which step(s) to refine
       - Replace selected step(s) with more detailed breakdown
       - Keep checked steps unchanged

       **If "Update verification":**
       - Show current Verification section
       - Ask for updated verification criteria
       - Replace Verification section content

       **If "Research more":**
       - Spawn Explore agent (same as step 8) with focus on remaining work
       - Present findings and ask what to add/change
       - Update How section based on new research

    4. **Preserve existing state:**
       - Do NOT change status (keep `elaborated` or `in-progress`)
       - Do NOT reset any checkboxes
       - Only add to or refine existing content

    ---

    ### Observation Step Tagging Rules

    When generating How checkboxes (in any path above), tag steps with `👁` if they require user observation:

    ```markdown
    - [ ] 👁 Step N: Add request logging and run the app to observe output
    ```

    **Tag with `👁` when:**
    - The step requires the user to manually run, view, or verify something the agent cannot observe (mobile simulator, browser UI, terminal output from a running app, visual appearance, etc.)
    - The step adds instrumentation/logging/debugging where the output requires running the app in a way the agent can't (e.g., mobile simulator, browser, GUI app)

    **Do NOT tag when:**
    - The agent can verify the result itself (running tests, checking file contents, CLI output from build commands)
    - The step writes automated tests or assertions

    **Instrumentation dependency rule:** If a step adds instrumentation/logging solely to inform a subsequent fix step, place them in separate checkboxes so execution can pause between them. Note this relationship in the step description, e.g.:
    ```markdown
    - [ ] 👁 Step 3: Add request logging to track API response times (observation needed before optimization)
    - [ ] Step 4: Optimize slow endpoints based on logging results
    ```

12. **Validate How steps against codebase**

    After generating the How section, validate each step:
    - For steps referencing specific files, functions, or hooks: confirm they exist using Glob/Grep
    - For steps proposing new abstractions (new utility, new hook, new helper): search for existing functionality that overlaps
      - If existing solution found: revise the step to reuse it instead of creating something new
    - If a file path referenced in a step is wrong: correct it

    Show user what was adjusted (if anything). If 2+ steps needed correction, use AskUserQuestion to confirm the adjusted plan:

    **Skip mode shortcut:** If `skip_mode` is true, auto-select "Yes, proceed" and continue without calling `AskUserQuestion`.

    ```
    question: "I adjusted N steps based on codebase validation. Does this revised plan look correct?"
    header: "Validation"
    options:
      - label: "Yes, proceed"
        description: "Use the validated plan as-is"
      - label: "Let me review"
        description: "Show me the details of what changed"
    ```

13. **Generate Impact Scope** (for tasks touching 3+ files)

    If the How section references 3 or more files to modify, generate an Impact Scope section:
    ```markdown
    ## Impact Scope

    ### Files to Modify
    - [ ] `path/to/file1.ext` — [what changes]
    - [ ] `path/to/file2.ext` — [what changes]

    ### Related Files (may need updates)
    - `path/to/related1.ext` — [why it might be affected]

    ### Endpoints/UI Affected
    - [endpoint or UI element] — [expected change]
    ```

    Validation:
    - Every file path must exist (verify with Glob)
    - Cross-reference with How steps — every file in Impact Scope should be addressed by at least one How step
    - If fewer than 3 files: skip this section entirely

14. **Update task file**
    - Fill in Why, How, Verification, and Impact Scope (if applicable) sections
    - Update Status to `elaborated`
    - Write the updated file

15. **Commit .plans/ changes**
    - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
    - If not a git repo: skip silently
    - Read `.plans/config.json` for `git_commits` setting
    - If `git_commits` is not `true`: skip silently
    - Check for uncommitted changes in .plans/: `git status --porcelain .plans/`
    - If no changes: skip silently
    - Commit:
      ```bash
      git add .plans/
      git commit -m "plan: elaborate #NNN - [title]"
      ```
    - If commit fails (e.g. hooks): warn but do not fail the skill

16. **Display confirmation**

    **If part of multi-task loop (multiple `task_ids`):** show abbreviated confirmation:
    ```
    Elaborated #NNN: [Title] (N steps)
    ```
    Then add task to `elaborated_tasks` list and continue to next task.

    **If single task:** show full confirmation:
    ```
    Elaborated task #NNN: [Title]
    Status: elaborated

    Steps (0/X complete):
    - [ ] Step 1: ...
    - [ ] Step 2: ...
    [etc.]

    Verification:
    [Brief summary of Verification section]

    Next: /plan-execute NNN to start working
    ```

    **STOP after displaying this confirmation. Do not proceed to execution.** The user must explicitly invoke `/plan-execute` to begin implementation. If the user responds with feedback or tweaks to the elaboration, apply the changes to the task file and re-display this confirmation — but do NOT start executing the task.

17. **Display multi-task summary**

    Only shown when multiple tasks were processed. If only one task was processed, skip this step entirely.

    ```
    Elaboration Summary

    Elaborated (N of M):
    - #001 - Fix login timeout bug (5 steps)
    - #003 - Add dark mode (4 steps)

    [If any skipped:]
    Skipped (N):
    - #002 - Already completed
    - #999 - Not found

    Next: /plan-execute 1 (or /plan-execute 3)
    ```

    **STOP after displaying this summary. Do not proceed to execution.** The user must explicitly invoke `/plan-execute` to begin implementation. If the user responds with feedback or tweaks to the elaboration, apply the changes to the task file(s) and re-display this summary — but do NOT start executing any task.

## Edge Cases

- **No ID argument**: List pending/elaborated tasks and ask
- **Description instead of ID**: Auto-capture the task, then elaborate the new task
- **Already elaborated or in-progress**: Treat as request for further elaboration (Path C)
- **Task not found**: Error with suggestion to run `/plan-list`
- **No pending tasks**: "No tasks to elaborate. Run `/plan-capture` to add one."
- **CONTEXT.md is minimal**: Still proceed, note that context is limited
- **Task tool unavailable**: Fall back to direct Glob/Grep/Read research
- **Sub-agent returns incomplete findings**: Supplement with direct research or ask user
- **Further elaboration on completed task**: Suggest `/plan-reopen` first
- **Multiple IDs with some invalid**: Skip invalid tasks with warning, continue elaborating valid ones
- **All IDs invalid**: Show error listing each invalid ID and reason
- **Duplicate IDs**: Deduplicate silently (e.g., "1 1 3" becomes IDs `001`, `003`)
- **Skip mode with no IDs**: Remember skip mode, prompt for IDs, then elaborate in skip mode
- **Skip mode with Path C**: Auto-select "Research more", auto-accept findings
- **Mixed pending/elaborated in multi-ID**: Each task follows its own path (A/B/C) independently
- **Sub-agent failure in multi-task**: Log error for that task, skip it, continue to next
- **Description with skip mode**: Auto-capture then elaborate in skip mode (e.g., `/plan-elaborate Fix login bug skip`)
- **Auto-capture failure**: Print error and stop — do not attempt elaboration without a task file
- **Description that looks like numbers**: If ALL tokens are numeric, they're IDs, not a description. "42" is ID 042. "Fix bug 42" is a description (has non-numeric tokens).
- **User responds with tweaks after elaboration**: Apply the requested changes to the task file (update How steps, Why, Verification, etc.), re-display the confirmation, and STOP. Do not proceed to execution — the user must invoke `/plan-execute` explicitly.
