---
name: plan-execute
disable-model-invocation: true
argument-hint: "<id|description> [steps N-M] [branch|worktree]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Task
  - WebFetch
  - WebSearch
description: Start or continue working on a task (auto-captures/elaborates if needed)
---

# plan-execute

Execute a task — start it if pending/elaborated, or resume if already in-progress. If given a description instead of an ID, auto-captures and auto-elaborates first. If a task exists but hasn't been elaborated, auto-elaborates inline. The AI actively implements the steps, writing code and making changes. When the project has an existing test suite, follow TDD (Test-Driven Development) practices.

> **RULE: Targeted tests only.** When running tests, ALWAYS scope to the specific files changed — never run the full test suite. Example: `rspec spec/models/user_spec.rb`, not `rspec`. `npm test -- user.test.js`, not `npm test`. The full suite is the user's responsibility.

## Arguments

- `$ARGUMENTS`: One or more task IDs, OR a task description, optionally followed by a branch keyword and/or step filter

**Parsing rules:**
- **Worktree keyword detection** (first) — set `worktree_mode = true` if `$ARGUMENTS` contains any of (case-insensitive): `worktree`, `use worktree`, `with worktree`
  - Strip worktree keywords from `$ARGUMENTS` before further parsing
  - `worktree_mode = true` implies `branch_mode = true` (worktrees always use branches)
- **Branch keyword detection** (second) — set `branch_mode = true` if `$ARGUMENTS` contains any of (case-insensitive): `branch`, `get branch`, `use branch`, `yes branch`
  - Strip branch keywords from `$ARGUMENTS` before further parsing
- **Step filter detection** (third) — check for step selection directives. Set `step_filter` if found, and strip from `$ARGUMENTS` before further parsing.

  **Explicit step references** (matched against argument string, case-insensitive):
  - `step N` or `steps N` → single step N (e.g., `step 3`)
  - `steps N-M` → step range N through M inclusive (e.g., `steps 3-5`)
  - `steps N,M,P` → specific steps N, M, P (e.g., `steps 1,3,5`)
  - `steps N-M,P` → mixed range and individual (e.g., `steps 1-3,5`)
  - Store as `step_filter = { type: "explicit", steps: [list of step numbers] }`

  **Natural language step references** (matched against remaining argument string after worktree/branch stripping, case-insensitive):
  - Detect phrases that describe a subset of steps rather than a task description. Look for patterns like:
    - Ordinal/positional: `first N steps`, `last N steps`, `next N steps`, `first batch`, `last batch`, `next batch`
    - Descriptive/topical: `the diagnostic steps`, `the setup steps`, `the testing steps`, `the refactoring steps`, `the UI steps`
    - Relative: `up to step N`, `from step N`, `starting at step N`, `everything after step N`
  - These phrases require the task to already exist (they reference its How steps), so they **cannot** coexist with auto-capture descriptions
  - Store as `step_filter = { type: "natural", query: "[the matched phrase]" }`
  - The query is resolved later in step 10 after reading the task's How steps

  **Disambiguation:** If the argument contains both a task ID and additional non-numeric text, check whether the text matches a step filter pattern before assuming it's a task description. For example, `1 first 3 steps` → task ID 001 with step filter, NOT a description. The presence of a leading numeric token followed by step-filter language should be parsed as ID + filter.

- **Determine argument type** — after removing worktree/branch/step-filter tokens, examine what remains:
  - If ALL remaining tokens are numeric → task IDs. Zero-pad each to 3 digits. Deduplicate.
  - If ANY remaining token is non-numeric → the entire remaining string (including any numbers) is a **task description** for auto-capture. Set `auto_capture = true`.
  - If nothing remains → no IDs and no description (will prompt for task selection)
- IDs and branch/worktree keywords coexist freely.
- A description and branch/worktree keywords coexist freely.
- Step filters coexist with IDs and branch/worktree keywords, but NOT with auto-capture descriptions.
- If `step_filter` is set and `auto_capture` would also be true, this is ambiguous — treat the entire string as a description (auto-capture wins). Step filters only make sense for existing tasks.

**Examples:**
- `/plan-execute 1` → execute task 1
- `/plan-execute 1 3 5` → execute tasks 1, 3, 5 sequentially
- `/plan-execute 1 branch` → execute task 1, auto-create git branch
- `/plan-execute 1 3 5 branch` → execute tasks 1, 3, 5, each gets its own branch
- `/plan-execute 1 worktree` → execute task 1, create branch + worktree, execute in isolation
- `/plan-execute Fix login timeout bug` → auto-capture, auto-elaborate, then execute
- `/plan-execute Fix login bug branch` → auto-capture, auto-elaborate, then execute with git branch
- `/plan-execute Fix login bug use worktree` → auto-capture, auto-elaborate, execute in worktree
- `/plan-execute 1 steps 3-5` → execute only steps 3, 4, 5 of task 1
- `/plan-execute 1 step 3` → execute only step 3 of task 1
- `/plan-execute 1 steps 1,3,5` → execute steps 1, 3, and 5 of task 1
- `/plan-execute 1 first 3 steps` → execute the first 3 steps of task 1
- `/plan-execute 1 the diagnostic steps` → execute steps whose descriptions relate to diagnostics
- `/plan-execute 1 next batch` → execute the next segment of uncompleted steps
- `/plan-execute 1 last 2 steps` → execute the last 2 steps of task 1

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Parse and resolve arguments**
   - Check for worktree keywords/phrases (see Arguments section) → store as `worktree_mode` flag (true/false). If true, also set `branch_mode = true`.
   - Strip worktree keywords from `$ARGUMENTS`
   - Check for branch keywords/phrases (see Arguments section) → store as `branch_mode` flag (true/false)
   - Strip branch keywords from `$ARGUMENTS`
   - Check for step filter (see Arguments section) → store as `step_filter` (or null if none found)
     - Check explicit patterns first: `steps? N`, `steps N-M`, `steps N,M,P`, `steps N-M,P`
     - Then check natural language patterns: `first/last/next N steps`, `first/last/next batch`, `the [topic] steps`, `up to step N`, `from step N`, `starting at step N`, `everything after step N`
     - Strip matched step filter text from `$ARGUMENTS`
   - Examine remaining tokens:
     - If ALL remaining tokens are numeric → task IDs. Zero-pad each to 3 digits, deduplicate → store as `task_ids` list. Set `auto_capture = false`.
     - If ANY remaining token is non-numeric AND `step_filter` is NOT set → the entire remaining string is a task description. Set `auto_capture = true`. Store as `capture_description`.
     - If ANY remaining token is non-numeric AND `step_filter` IS set → ambiguous. Discard `step_filter`, treat entire original remaining string as a description. Set `auto_capture = true`. (Step filters only work with existing task IDs.)
     - If nothing remains → `task_ids` is empty, `auto_capture = false`

3. **Auto-capture and auto-elaborate** (only if `auto_capture` is true)

   Print: `--- Auto-capturing task: [capture_description] ---`

   Read `skills/plan-capture/SKILL.md` and follow its steps 1–8 (capture only, no auto-proceed chaining) using `capture_description` as the task description:
   - Verify initialization, generate ID, slugify, infer type, write task file, update config, update PROGRESS.md
   - Store the newly created task ID

   Show brief confirmation:
   ```
   Captured task #NNN: [Title]
   Type: [type] | Status: pending
   ```

   Then immediately auto-elaborate:

   Print: `--- Auto-elaborating task #NNN ---`

   Read `skills/plan-elaborate/SKILL.md` and follow its steps 1–15 for the new task ID, with `skip_mode = true`:
   - Research sub-agent spawns normally
   - All prompts are auto-accepted (skip mode behavior)

   Show abbreviated confirmation:
   ```
   Elaborated #NNN: [Title] (N steps)
   ```

   Set `task_ids` to the single newly created ID. Continue to step 4.

   **If capture fails:** Print error and STOP.
   **If elaboration fails:** Print warning: `Auto-elaboration failed: [reason]. Task was captured but not elaborated.` Then continue — the elaboration gate in step 5a will handle the un-elaborated task.

4. **Handle missing IDs** (only if `task_ids` is empty and `auto_capture` is false)
   - First, look for in-progress tasks
   - If exactly one in-progress task: auto-select it (populate `task_ids` with that single ID)
   - If multiple in-progress tasks: list them and ask which to continue
   - If no in-progress tasks: list elaborated tasks (preferred) then pending tasks:
     ```
     Ready to execute (elaborated):
     #001 - Fix login timeout bug

     Also available (not yet elaborated):
     #002 - Add dark mode

     Which task ID to execute?
     ```
   - Parse the user's response for numeric IDs the same way
   - If no tasks at all: "No tasks available. Run `/plan-capture` to add one."

5. **Begin multi-task execution**

   Wrap steps 6–15 in a per-task loop over `task_ids`:

   - Show progress header for each task:
     ```
     --- Executing task [X] of [N]: #NNN ---
     ```
   - On non-fatal error per task (not found, already completed): log warning `Skipping #NNN: [reason]`, continue to next task
   - Track results in two lists: `executed_tasks` (succeeded), `skipped_tasks` (failed/skipped with reason)

   **For each task in `task_ids`, execute steps 6–15:**

6. **Load task and determine mode**
   - Read the task file
   - Check Status field to determine mode:
     - `pending`: Start mode (needs elaboration first — see step 7a)
     - `elaborated`: Start mode (ideal)
     - `in-progress`: Resume mode
     - `review`: Resume mode — set status back to `in-progress`, use `AskUserQuestion` to ask if user wants worktree or current directory:
       - Header: "Resume review"
       - Question: "Task #NNN is in review. Resume execution in current directory or create a new worktree?"
       - Options:
         1. "Current directory" (description: "Continue working in the current checkout")
         2. "New worktree" (description: "Create a fresh worktree for this task")
       - If "New worktree": set `worktree_mode = true`, `branch_mode = true`
     - `completed`: "Task #NNN is already completed."
     - Not found: "Task #NNN not found. Run `/plan-list` to see available tasks."
   - **Worktree resume check** (if status was `in-progress`):
     - If task has `**Worktree:**` field:
       - If the path exists: set execution working directory to that path, set `worktree_mode = true`
       - If the path doesn't exist: warn "Worktree path no longer exists. Continuing in current directory.", remove `**Worktree:**` line from task file
     - **Multi-repo resume** (if task has both `**Worktree:**` and `**Repos:**` fields):
       - Set `multi_repo_mode = true`
       - Parse `**Repos:**` field to restore `relevant_repos` list
       - Existing path-exists check applies as-is

6b. **Check dependencies**
    - If the task file has a `**Blocked by:**` field, parse the referenced task IDs
    - For each blocker ID, check if the task exists in `.plans/completed/`
    - If ALL blockers are completed: proceed (dependencies satisfied)
    - If any blocker is NOT completed:
      - Error:
        ```
        Task #NNN is blocked by:
          #MMM - [title] (status: [status]) ✗

        Complete the blocking task first, or clear the dependency:
          /plan-execute MMM
          /plan-depends NNN clear
        ```
      - STOP execution for this task. If in multi-task loop, skip to next task.

7. **If starting (pending/elaborated status):**

   a. **Auto-elaborate if not elaborated**
      - If status is `pending`, **MUST use `AskUserQuestion` tool**:
        - Header: "Not elaborated"
        - Question: "Task #NNN hasn't been elaborated yet. Elaboration improves success rate significantly. What would you like to do?"
        - Options:
          1. "Elaborate now (recommended)" (description: "Auto-elaborate then continue to execution")
          2. "Execute anyway" (description: "Skip elaboration and start executing now")
      - If "Elaborate now":
        - Print: `--- Auto-elaborating task #NNN ---`
        - Read `skills/plan-elaborate/SKILL.md` and follow its steps 1–15 for this task ID, with `skip_mode = true`
        - Research sub-agent spawns normally; all prompts are auto-accepted
        - Show abbreviated confirmation: `Elaborated #NNN: [Title] (N steps)`
        - Re-read the task file (it has been updated by elaboration) and continue
        - **If elaboration fails:** Print warning and fall through to "Execute anyway" behavior
      - If "Execute anyway": continue, and append `**Warning:** Executed without elaboration` below the Status line in the task file

   b. **Check for other in-progress tasks**
      - Scan `.plans/pending/*.md` for Status: in-progress
      - If found, warn but don't block:
        ```
        Note: Task #MMM is also in progress. Consider completing it first.
        Proceeding with #NNN anyway.
        ```

   c. **Ask about git branch** (if in a git repo)
      - Check if current directory is a git repository: `git rev-parse --git-dir 2>/dev/null`
      - If not a git repo:
        - Scan for sub-repos: find immediate subdirectories with `.git` directories (`find . -maxdepth 2 -name .git -type d`)
        - If sub-repos found: set `multi_repo_mode = true`, store list of sub-repo directory names
        - If none found: skip this step silently (not a git project)
      - **If `multi_repo_mode` is true:**
        - Determine branch type and generate suggested branch name as below (same logic)
        - Follow the same branch question / auto-accept flow as below
        - Do NOT create branches yet — defer to after step 7d determines `relevant_repos`
        - After step 7d completes: create the branch in each relevant sub-repo: `cd [sub-repo] && git checkout -b [branch-name]`
        - Branch metadata format: `**Branch:** [branch-name] (multi-repo: [comma-separated repo names])`
      - Determine branch type from task type:
        - `bug` → "fix"
        - `feature` → "feature"
        - `refactor` → "refactor"
        - `chore` → "chore"
      - Generate suggested branch name: `[type]/NNN-[slug]` (e.g., `feature/001-add-dark-mode`)
      - **Auto-accept shortcut:** If `branch_mode` is true (set in step 2), skip the question and immediately create the suggested branch — no `AskUserQuestion` needed.
      - **Otherwise, MUST use `AskUserQuestion` tool** to prompt user about branch creation:
        - Header: "Git branch"
        - Question: "Create a git branch for this task?"
        - Options:
          1. "Yes, use suggested" (description: the suggested branch name)
          2. "No branch" (description: "Continue without creating a branch")
          3. User can also select "Other" to provide a custom branch name
      - If user selects suggested or provides custom name, or auto-accepted via shortcut:
        - **If `worktree_mode` is true:** use worktree creation (step 7e) instead of `git checkout -b`
        - **Otherwise:** Create and checkout branch: `git checkout -b [branch-name]`
        - Add branch metadata to task file: `**Branch:** [branch-name]` (below the Status line)
      - If user selects "No branch": continue without creating branch (also disables `worktree_mode`)

   d. **Determine relevant sub-repos** (only if `multi_repo_mode` is true)
      - Parse the task's How section and Impact Scope section (if present) for file paths
      - Match path prefixes to sub-repo directory names (e.g., a path like `repo-a/src/main.js` matches sub-repo `repo-a`)
      - If matches found: store as `relevant_repos`
      - If no matches found: use `AskUserQuestion` to ask the user:
        - Header: "Multi-repo project"
        - Question: "Which repositories are relevant to this task?"
        - Options: list each discovered sub-repo name + "All of them"
      - Store final list as `relevant_repos`

   e. **Create worktree** (only if `worktree_mode` is true and branch was created in step 7c)

      **Single-repo path** (when `multi_repo_mode` is false):
      1. Get project root: `git rev-parse --show-toplevel`
      2. Check not already in a worktree: `git rev-parse --is-inside-work-tree` and `git rev-parse --show-superproject-working-tree`
         - If already in a worktree: warn "Already inside a worktree. Falling back to normal branch mode.", set `worktree_mode = false`, create branch with `git checkout -b [branch-name]` instead, and skip remaining worktree steps
      3. Create worktree: `git worktree add .worktrees/NNN-slug -b [branch-name]`
         - Where NNN-slug matches the task filename stem (e.g., `003-fix-login`)
      4. Ensure `.worktrees/` is in `.gitignore`:
         - Read `.gitignore` (create if doesn't exist)
         - If `.worktrees/` not present, append it
      5. Symlink shared .plans/: `ln -s [project-root]/.plans [worktree-path]/.plans`
      6. Add metadata to task file: `**Worktree:** [absolute-worktree-path]` (below the Branch line)
      7. Set execution working directory to the worktree path for all subsequent steps

      **Multi-repo path** (when `multi_repo_mode` is true):

      Creates a unified worktree directory that mirrors the parent layout:
      ```
      parent/
        .worktrees/
          NNN-slug/              ← execution root
            repo-a/ → repo-a/.worktrees/NNN-slug
            repo-b/ → repo-b/.worktrees/NNN-slug
            shared-config/ → ../../shared-config    (non-git dirs symlinked)
            .plans/ → ../../.plans
        repo-a/.worktrees/NNN-slug/   ← actual git worktree
        repo-b/.worktrees/NNN-slug/   ← actual git worktree
      ```

      Steps:
      1. Create parent-level worktree directory: `mkdir -p .worktrees/NNN-slug`
      2. For each repo in `relevant_repos`:
         - Create per-repo worktree: `cd [repo] && git worktree add .worktrees/NNN-slug -b [branch-name]`
         - Symlink into parent worktree dir: `ln -s [absolute-path-to-repo]/.worktrees/NNN-slug .worktrees/NNN-slug/[repo-name]`
      3. Symlink non-git subdirectories into worktree dir: for each immediate subdirectory that is NOT a git repo and NOT `.worktrees`, create `ln -s ../../[dir-name] .worktrees/NNN-slug/[dir-name]`
      4. Symlink `.plans/`: `ln -s ../../.plans .worktrees/NNN-slug/.plans`
      5. Ensure `.worktrees/` is in `.gitignore` for each relevant repo AND in the parent directory's `.gitignore`:
         - For each repo: read `[repo]/.gitignore`, append `.worktrees/` if not present
         - For parent: read `.gitignore`, append `.worktrees/` if not present
      6. Add metadata to task file:
         - `**Worktree:** [absolute-path-to-.worktrees/NNN-slug]` (below the Branch line)
         - `**Repos:** [comma-separated list of relevant repo names]` (below the Worktree line)
      7. Set execution working directory to `.worktrees/NNN-slug/` for all subsequent steps

   f. **Update task status**
      - Change Status from `pending` or `elaborated` to `in-progress`
      - Write updated task file

   g. **Update PROGRESS.md**
      - Add task to "Active Work" section:
        ```
        ## Active Work
        - **#NNN** - [Title] (started [YYYY-MM-DD])
        ```
      - Update Stats section counts

8. **Detect test suite**
   Check for an existing test suite by looking for:

   **Ruby/RSpec:**
   - `spec/` directory with `*_spec.rb` files
   - `Gemfile` containing `rspec`

   **JavaScript/TypeScript:**
   - `package.json` containing `jest`, `mocha`, `vitest`, or test scripts
   - `__tests__/` directory or `*.test.js`, `*.spec.ts` files

   **Python:**
   - `pytest.ini`, `pyproject.toml` with pytest config, or `tests/` directory
   - `*_test.py` or `test_*.py` files

   **Go:**
   - `*_test.go` files

   **Other:**
   - Any `test/`, `tests/`, or `spec/` directory with test files

   Note: If a test suite is detected, set `has_tests = true` for use in execution steps.

9. **Load context and present current state**
   - Read `.plans/CONTEXT.md` for project context
   - Note what's in the Changes section (work done so far)

   Parse the How section for checkboxes and count:
   - Total checkboxes: count all `- [ ]` and `- [x]` lines in How section
   - Completed: count `- [x]` lines
   - Remaining: count `- [ ]` lines

   **Parse Issues section (if present):**
   - Look for `## Issues` section
   - Count unchecked issues: `- [ ]` lines
   - Count resolved issues: `- [x]` lines
   - Set `has_issues = true` if any unchecked issues exist
   - Set `issue_count` = number of unchecked issues

   ```
   [Starting/Continuing] task #NNN: [Title]
   Type: [type] | Branch: [branch-name or "none"]
   Test Suite: [Detected: RSpec/Jest/pytest/etc.] or [None detected]

   ## Progress (X/Y steps complete)
   - [x] Completed step 1
   - [x] Completed step 2
   - [ ] **Next:** Remaining step 3  ← highlight next incomplete
   - [ ] Remaining step 4

   ## Issues (N unresolved)                    ← only show if issues exist
   - [ ] Login button doesn't respond on mobile Safari
   - [ ] Timeout shows raw stack trace

   ## Changes So Far
   [Changes section content, or "No changes recorded yet"]

   ## Verification
   [Verification criteria]
   ```

   Highlight the first unchecked item as the next step to work on.
   If issues exist, show them after Progress section.

10. **Prepare for segmented execution**

   **IMPORTANT: ALL implementation work MUST use the plan-executor sub-agent.**
   Never write code or make changes directly — always delegate to the executor agent.
   This ensures fresh context and consistent execution quality.

   **Resolve step filter** (if `step_filter` is set)

   Parse all How section checkboxes into a numbered list (step 1, step 2, etc. based on order in the file).

   - **If `step_filter.type == "explicit"`:** Use the step numbers directly. Validate they exist (1 ≤ N ≤ total steps). Error if any are out of range: `"Step N is out of range (task has M steps)."`
   - **If `step_filter.type == "natural"`:** Resolve the query against the step list:
     - `first N steps` → steps 1 through N
     - `last N steps` → steps (total-N+1) through total
     - `next N steps` → starting from first unchecked step, take N steps
     - `first batch` / `next batch` → the next segment of unchecked steps (use normal segmentation rules to determine segment boundaries, then select the first pending segment)
     - `last batch` → the final segment per normal segmentation rules
     - `the [topic] steps` → match step descriptions containing the topic keyword(s). E.g., `the diagnostic steps` matches steps with "diagnos" in their description; `the setup steps` matches "setup", "configure", "initialize", "scaffold", etc. Use fuzzy keyword matching — the topic words should appear in or relate to the step description. If no steps match, error: `"No steps matching '[topic]' found in task #NNN."`
     - `up to step N` → steps 1 through N
     - `from step N` / `starting at step N` → steps N through total
     - `everything after step N` → steps (N+1) through total

   After resolving, store as `filtered_steps` (a list of step numbers to execute). Only these steps will be included in segmentation — all other steps are skipped. Already-checked steps within the filter are also skipped (only unchecked steps are executed).

   If `step_filter` is null (not set), behavior is unchanged — all unchecked steps are included as before.

   Show filter summary when active:
   ```
   Step filter: executing steps [list] of [total]
   ```

   **Identify observation steps**

   An observation step is any step requiring the user to run, view, or manually verify something that can't be confirmed by automated means. Detection (in priority order):
   1. **Explicit marker:** Steps tagged with `👁` prefix (from elaboration tagging) — always treated as observation steps
   2. **Keyword heuristics** (fallback for untagged steps):
      - Logging/debug/console/print output the user needs to read
      - Running the app and observing behavior
      - Visual or behavioral verification (UI, browser, terminal)
      - Phrases like "verify that", "check that", "should see", "should show", "observe", "look for", "confirm visually" referring to manual observation
   - **NOT** steps about writing automated tests or assertions — those are normal implementation steps

   **Segmentation rules**

   - If `filtered_steps` is set, only include those steps (that are still unchecked) in segmentation. Otherwise, include all unchecked steps.
   - Group remaining steps into segments of 3-4 steps each
   - Example: 7 steps → segments of 4, 3
   - Example: 2 steps → single segment of 2
   - **Observation step rule:** An observation step MUST be the **last** step in its segment. This creates a natural pause point where the user can observe and provide feedback before execution continues.
     - If an observation step falls in the middle of what would be a segment, split the segment so the observation step is last in the first part
     - Multiple consecutive observation steps → each ends its own segment
     - An observation step that is first in remaining steps → include 1-2 preceding non-observation steps if available, or create a single-step segment
   - **Instrumentation dependency rule:** If a step adds instrumentation/logging/debugging AND a later step implements a fix or solution informed by that instrumentation, these steps MUST be in different segments with the instrumentation step ending its segment. This ensures a pause for observation between adding instrumentation and acting on its results — even if the instrumentation step wasn't explicitly tagged with `👁`.

11. **Execute segments**

   **MANDATORY: Spawn plan-executor sub-agent for ALL implementation work.**

   **a. Create or load state file**

   State file location: `.plans/state/NNN-state.md`

   If state file exists (resuming), load it to determine which segments are complete.

   If starting fresh, create state file:
   ```markdown
   # Execution State: Task #NNN

   **Task:** [Title]
   **Branch:** [branch-name or "none"]
   **Started:** [ISO timestamp]

   ## Segments
   - Segment 1 (steps 1-4): pending
   - Segment 2 (steps 5-8): pending
   - Segment 3 (steps 9-10): pending

   ## Completed Steps
   _None yet_

   ## Key Decisions
   _None yet_

   ## Deviations
   _None yet_

   ## Observations
   _None yet_

   ## Test Status
   _Not yet run_
   ```

   **b. Execute each pending segment**

   For each segment that is not yet complete:

   1. Show status: `Executing segment N/M (steps X-Y)...`

   2. Spawn sub-agent using `Task` tool:
      ```
      subagent_type: "plan-executor"
      model: "opus"
      prompt: [segment execution prompt - see template below]
      ```

   3. Parse sub-agent response for:
      - Completed steps (with outcomes and files touched)
      - Key decisions made
      - Deviations from plan
      - Blockers (if any)
      - Test status

   4. Update state file:
      - Mark segment as complete
      - Add completed steps to "Completed Steps" section
      - Add any decisions to "Key Decisions"
      - Add any deviations to "Deviations"
      - Update test status

   5. Update task file:
      - Check off completed steps (`- [ ]` → `- [x]`)
      - Add to Changes section

   6. **If segment's last step was an observation step:**

      **If `worktree_mode` is true — defer observation to review:**
      - Do NOT pause with AskUserQuestion
      - Check if later steps depend on this observation (instrumentation dependency rule applied during segmentation, or step language like "based on what you saw", "if the output shows"):
        - If dependent: Record in state file Observations section: `- Step N: ⏳ Deferred to review (⚠ later steps depend on this — agent proceeded with plan assumptions)`
        - If not dependent: Record in state file Observations section: `- Step N: ⏳ Deferred to review`
      - Continue to next segment

      **If `worktree_mode` is false — MUST pause for user feedback:**

      **MUST use `AskUserQuestion` tool:**
      - Header: `"Observation"`
      - Question: Quote the observation step description, tell the user the implementation/prerequisites are in place, and ask them to perform the observation and report what they see. Example: `"Step 'Add request logging and verify output' is ready. Please run the app and check the console output. What do you see?"`
      - Options:
        1. "Looks good" (description: "The observation matches expectations — continue to next segment")
        2. "Something's wrong" (description: "The observation doesn't match — describe what you see")
        3. "Skip" (description: "Continue without verifying this step")
      - **On "Looks good":**
        - Record in state file Observations section: `- Step N: ✓ User confirmed`
        - Continue to next segment
      - **On "Something's wrong":**
        - Ask user to describe what they observed (they can type in the "Other" text field, or describe in the follow-up)
        - Record in state file Observations section: `- Step N: ✗ [user's observation]`
        - Spawn plan-executor sub-agent with `model: "opus"` to fix the issue, including the user's observation in the prompt
        - After fix, **ask user to re-observe** using `AskUserQuestion` again with the same format
        - If user says "Something's wrong" again after 2 fix attempts, suggest manual investigation:
          ```
          Two fix attempts haven't resolved this. Consider investigating manually,
          or run `/plan-issue` to capture this for a focused debugging session.
          ```
          Then continue to next segment (don't block indefinitely)
      - **On "Skip":**
        - Record in state file Observations section: `- Step N: ⊘ Skipped`
        - Continue to next segment

   7. **If sub-agent reports a blocker:**
      - STOP execution of current task
      - Show the blocker to user
      - **If multiple tasks remain in batch**, **MUST use `AskUserQuestion` tool**:
        - Header: "Blocker"
        - Question: "Task #NNN is blocked. How would you like to proceed?"
        - Options:
          1. "Stop all" (description: "Stop the entire batch")
          2. "Skip this task, continue to #MMM" (description: "Add to skipped list and move to next task")
      - **If single task or "Stop all"**: stop entirely
      - **If "Skip this task"**: add to `skipped_tasks`, continue loop to next task
      - Do not continue to next segment within the same task

   8. **Escalation after repeated failures**
      Track consecutive deviations/failures per segment. After the 2nd deviation or failure in the same segment, STOP and:
      - Show what went wrong in both attempts
      - **MUST use `AskUserQuestion` tool**:
        - Header: "Rethink"
        - Question: "Two attempts at this segment have failed. How would you like to proceed?"
        - Options:
          1. "Research alternatives" (description: "Spawn Explore agent to find a better approach, then update How section")
          2. "I know what to do" (description: "I'll provide the correct approach")
          3. "Skip this segment" (description: "Mark as skipped and continue to next segment")
      - If "Research alternatives": spawn Explore agent focused on the failing steps, present findings, update How section with revised approach, then retry the segment
      - If "I know what to do": accept user's approach, update How section, then retry the segment
      - If "Skip this segment": mark segment as skipped in state file, continue to next segment

   **c. Segment execution prompt template**

   ```markdown
   Execute steps for a plans-cc task segment.

   ## Task Context
   **ID:** #NNN
   **Title:** [Title]
   **Type:** [type]
   **Branch:** [branch-name]
   [If worktree_mode]: **Worktree:** [worktree-path] — ALL work must happen inside this directory. Prefix all bash commands with `cd [worktree-path] &&`.
   [If worktree_mode AND multi_repo_mode]: Worktree is a multi-repo project; sub-repos ([relevant_repos list]) are worktree copies, other directories are symlinked from the parent. All file paths work identically to the original layout.

   ## Project Context
   [Abbreviated CONTEXT.md content - tech stack, key patterns, testing info]

   ## Previous Work (from earlier segments)
   [From state file: completed steps, key decisions, any relevant context]

   ## Your Segment
   Execute these steps in order:
   - [ ] Step X: [description]
   - [ ] Step Y: [description]
   - [ ] Step Z: [description]

   ## Test Suite
   [If detected]: Follow TDD (red-green-refactor) for each step
   [Test commands]: [e.g., "bundle exec rspec", "npm test"]

   ## CRITICAL RULE: Targeted Tests Only
   **DO NOT run the full test suite. Ever. For any reason.**
   Only run tests directly related to your changes:
   - Run the specific test file(s) for code you modify (e.g., `rspec spec/models/user_spec.rb`, `npm test -- user.test.js`, `pytest tests/test_user.py`)
   - If you create new test files, run only those files
   - If unsure which tests to run, run none — never default to the full suite
   - Full suite runs are slow and are the user's responsibility

   ## Impact Scope
   [If task has an Impact Scope section, include it here]
   Verify that your changes address all files listed in Impact Scope. If you modify a file
   not listed in Impact Scope, note it as a Deviation. If an Impact Scope file seems
   unnecessary after reading the code, note that as a Deviation too.

   ## Observation Steps
   [If the segment's final step is an observation step, include this section:]
   The final step in this segment ("[step description]") is an observation step
   that requires the user to manually verify something. Implement all prerequisites
   for the observation (add logging code, configure output, etc.) but do NOT mark
   the observation as verified — user verification happens outside this agent.
   ```

   **d. After all segments complete**

   - **If `worktree_mode` is true:** proceed to worktree finish (step 11e) instead of showing the normal summary
   - **Otherwise:** show completion summary:
     ```
     All segments complete for task #NNN

     Total: X/Y steps completed
     Segments: N segments executed
     Deviations: [count] (see state file for details)

     Run `/plan-complete NNN` to finalize.
     ```
   - Keep state file for reference (don't delete)

   **e. Worktree finish** (only if `worktree_mode` is true — runs after all segments complete)

   **Single-repo path** (when `multi_repo_mode` is false):

   1. Commit any uncommitted changes in worktree:
      ```bash
      cd [worktree-path] && git add -A && git status --porcelain
      ```
      If there are uncommitted changes:
      ```bash
      cd [worktree-path] && git commit -m "plan: complete work on task #NNN - [title]"
      ```
   2. Set task status to `review` (not `in-progress`)
   3. Return to project root: `cd [project-root]`
   4. Remove worktree: `git worktree remove .worktrees/NNN-slug`
      - If remove fails (dirty worktree), force it: `git worktree remove --force .worktrees/NNN-slug`
   5. Remove `**Worktree:**` line from task file (branch metadata stays)
   6. Skip steps 12-14 (testing/feedback loop) — worktree workflow defers this to `/plan-review`
   7. Show worktree completion summary — print EXACTLY this format and STOP:
      ```
      All segments complete for task #NNN (worktree mode)

      Total: X/Y steps completed
      Branch: [branch-name] (ready for review)
      Worktree: cleaned up

      Next: /plan-review NNN
      ```
      **STOP after "Next:" line. Do not add any other instructions, suggestions, or testing advice. `/plan-review` handles branch checkout automatically — the user does NOT need to merge or checkout anything manually.**

   **Multi-repo path** (when `multi_repo_mode` is true):

   1. For each repo in `relevant_repos`:
      - Check for changes: `cd .worktrees/NNN-slug/[repo-name] && git status --porcelain`
      - If changes exist: `git add -A && git commit -m "plan: complete work on task #NNN - [title]"`
      - Track which repos had changes in `repos_with_changes` list
   2. Return to parent directory
   3. For each repo in `relevant_repos`:
      - Remove worktree: `cd [repo-name] && git worktree remove .worktrees/NNN-slug`
        - If remove fails, force it: `git worktree remove --force .worktrees/NNN-slug`
      - If repo had NO changes committed: clean up empty branch: `git branch -d [branch-name]`
   4. Remove parent-level worktree directory: `rm -rf .worktrees/NNN-slug`
      - If `.worktrees/` is now empty, remove it too: `rmdir .worktrees 2>/dev/null`
   5. Set task status to `review` (not `in-progress`)
   6. Remove `**Worktree:**` and `**Repos:**` lines from task file (branch metadata stays)
   7. Skip steps 12-14 (testing/feedback loop) — worktree workflow defers this to `/plan-review`
   8. Show worktree completion summary — print EXACTLY this format and STOP:
      ```
      All segments complete for task #NNN (worktree mode)

      Total: X/Y steps completed
      Branch: [branch-name] (ready for review)
      Repos with changes: [repos_with_changes list, or "none"]
      Worktree: cleaned up

      Next: /plan-review NNN
      ```
      **STOP after "Next:" line. Do not add any other instructions, suggestions, or testing advice. `/plan-review` handles branch checkout automatically — the user does NOT need to merge or checkout anything manually.**

12. **Run ONLY targeted tests before pausing**
    **CRITICAL: Never run the full test suite. Only run specific test files for code you changed.**
    If a test suite exists, run **only** the tests directly related to your changes:
    - Run focused/scoped tests for the specific files you modified
      - RSpec: `rspec spec/models/user_spec.rb` (not `rspec` or `rspec spec/`)
      - Jest: `npm test -- user.test.js` (not `npm test`)
      - pytest: `pytest tests/test_user.py` (not `pytest`)
    - **NEVER run the full test suite** — that's slow and the user's responsibility
    - If tests fail, either fix them or note the failures in the status

13. **Resolve issues** (if `has_issues = true` and all How steps complete)

    After completing all How steps, if there are unresolved issues from manual testing, resolve them before finishing.

    **IMPORTANT: Use plan-executor agent for ALL issue fixes — never fix issues directly.**

    ```
    ## Resolving Issues

    All implementation steps complete. Now resolving X reported issue(s).
    ```

    **For each unchecked issue (`- [ ]`) in the Issues section:**

    Spawn a plan-executor sub-agent with `model: "opus"`:
    ```markdown
    Fix an issue reported during testing.

    ## Task Context
    **ID:** #NNN
    **Title:** [Title]

    ## Project Context
    [Abbreviated CONTEXT.md content]

    ## Issue to Fix
    [Issue description from the Issues section]

    ## Instructions
    1. Investigate: Search codebase, understand the reported behavior, identify cause
    2. Fix: Implement the fix, follow TDD if test suite exists
    3. Report: Describe what was changed and why
    ```

    After sub-agent completes:
    - Mark issue resolved: `- [ ]` → `- [x]`
    - Update Changes section with what was modified
    - Write updated task file
    - Report: `Resolved: [issue description]. Remaining issues: N`

    After all issues resolved:
    ```
    All issues resolved. Task ready for completion.
    Run `/plan-complete NNN` to finalize.
    ```

14. **Enter testing/feedback mode** (when all How steps complete)

    After completing all How steps (and resolving any existing issues from step 13), enter an interactive feedback mode for user testing:

    ```
    All implementation steps complete for task #NNN.

    Please test the changes. Describe any issues you find and I'll
    investigate and fix them immediately.

    When everything works, run `/plan-complete NNN` to finalize.
    ```

    **When user describes a problem:**

    a. **Recognize issue language**
       Look for indicators that the user is reporting a problem:
       - Problem words: "doesn't", "won't", "can't", "broken", "bug", "issue", "problem", "fail", "error", "wrong", "not working"
       - Negative observations: "still shows", "should be", "expected", "instead of"
       - Test context clues: "when I try", "if I click", "on mobile", "in Safari"

    b. **Auto-capture to Issues section**
       - Extract a concise issue description from user message
       - Add to task file's Issues section: `- [ ] [description]`
       - If Issues section doesn't exist, create it after the How section
       - Confirm briefly: "Issue captured: [description]"

    c. **Investigate and resolve using plan-executor agent**
       **IMPORTANT: Use plan-executor agent for ALL fixes — never fix issues directly.**

       Spawn a plan-executor sub-agent with `model: "opus"` (same as step 13):
       ```markdown
       Fix an issue reported during testing.

       ## Task Context
       **ID:** #NNN
       **Title:** [Title]

       ## Project Context
       [Abbreviated CONTEXT.md content]

       ## Issue to Fix
       [Issue description]

       ## Instructions
       1. Investigate: Search codebase, understand the reported behavior, identify cause
       2. Fix: Implement the fix, follow TDD if test suite exists
       3. Report: Describe what was changed and why
       ```

       After sub-agent completes:
       - Mark resolved: `- [x] [description]`
       - Update Changes section
       - Write updated task file

    d. **Continue feedback loop**

       **In multi-task mode (more tasks remain in batch):**
       ```
       Fixed: [issue description]

       Any other issues, or ready to move to next task?
       ```
       - Recognize "next", "continue", "move on" as signals to proceed to next task
       - Recognize "stop" as signal to end the batch early (show summary)
       - On "next": add to `executed_tasks`, continue loop

       **In single-task mode (or final task in batch):**
       ```
       Fixed: [issue description]

       Any other issues, or ready to complete?
       ```

    **When user indicates ready:**
    - Positive signals: "looks good", "works now", "ready", "done testing", "all good", "perfect", "that's it"
    - **In multi-task mode (more tasks remain):** also recognize "next", "continue", "move on" → add to `executed_tasks`, continue loop
    - **If user says "stop" during batch:** end batch early, show summary (step 16)
    - **In single-task mode (or final task):** "Great! Run `/plan-complete NNN` to finalize."

15. **Periodic status** (when pausing mid-execution)

    When pausing before all steps complete, show:
    ```
    Progress on #NNN: X/Y steps complete

    Completed this session:
    - [x] Step that was finished
    - [x] Another step finished

    Remaining:
    - [ ] Step still to do
    - [ ] Another step

    Issues: [N unresolved] or [All resolved] or [None]

    Related tests: [All passing] or [X failing - details]

    Continue with `/plan-execute NNN` or complete with `/plan-complete NNN`
    ```

    **In multi-task mode:** also note remaining tasks in the batch:
    ```
    Batch progress: [X] of [N] tasks complete
    Remaining tasks in batch: #MMM, #PPP

    Continue with `/plan-execute MMM PPP` to resume remaining tasks.
    ```

16. **Display multi-task summary**

    Only shown when multiple tasks were processed. If only one task was processed, skip this step entirely.

    ```
    Execution Summary

    Executed (N of M):
    - #001 - Fix login timeout (5/5 steps)
    - #003 - Add dark mode (4/4 steps)

    [If any skipped:]
    Skipped (N):
    - #002 - Already completed
    - #999 - Not found

    Next: /plan-complete 1 3
    ```

## Edge Cases

- **Description instead of ID**: Auto-capture the task, auto-elaborate in skip mode, then execute
- **Description with branch keyword**: Auto-capture, auto-elaborate, then execute with git branch (e.g., `/plan-execute Fix login bug branch`)
- **No ID + one in-progress task**: Auto-select it
- **No ID + multiple in-progress**: List them and ask which to continue
- **No ID + no in-progress**: List elaborated/pending tasks and ask which to start
- **No tasks at all**: "No tasks available. Run `/plan-capture` to add one."
- **Task already completed**: "Task #NNN is already completed."
- **Task not found**: "Task #NNN not found. Run `/plan-list` to see available tasks."
- **Task not elaborated (pending)**: Offer to auto-elaborate inline instead of stopping
- **Auto-capture failure**: Print error and stop entirely
- **Auto-elaborate failure**: Print warning, continue — elaboration gate in step 7a handles it
- **Description that looks like numbers**: If ALL tokens are numeric, they're IDs. "42" is ID 042. "Fix bug 42" is a description.
- **Changes section already has content**: Build on it, don't overwrite
- **Test suite detected but task is pure refactor**: Still use TDD — run existing tests before and after each change to ensure no regressions
- **Test already exists for the functionality**: Skip RED phase, go straight to GREEN
- **Flaky or slow tests**: Run focused tests during development (`rspec spec/file_spec.rb:42`)
- **No test suite but task mentions testing**: Suggest setting up a test framework appropriate to the project
- **Multiple IDs with some invalid**: Skip invalid tasks with warning, continue executing valid ones
- **All IDs invalid**: Show error listing each invalid ID and reason
- **Duplicate IDs**: Deduplicate silently (e.g., "1 1 3" becomes IDs `001`, `003`)
- **Worktree mode**: Creates branch + worktree, executes in isolation, sets status to `review` on completion
- **Worktree mode with multiple tasks**: Each task gets its own worktree; worktrees are cleaned up individually after each task completes
- **Already in a worktree**: Warns and falls back to normal branch mode
- **Worktree resume with stale path**: Removes stale `**Worktree:**` metadata, continues in current directory
- **Review status resume**: Asks user whether to use current directory or new worktree
- **Branch mode with multiple tasks**: Each task gets its own branch created from current HEAD
- **Blocker in multi-task**: Ask user whether to stop all or skip and continue to next task
- **Mixed statuses in multi-task**: Each task follows its own path independently
- **User says "stop" during testing/feedback in multi-task**: End batch early, show summary
- **Resuming segmented execution**: Load state file, skip completed segments, continue from where left off
- **Sub-agent reports blocker**: Stop, show user, ask for guidance before continuing
- **User message is ambiguous (question vs issue)**: If unclear whether user is reporting an issue or asking a question, treat as question and respond normally. Only auto-capture clear problem reports.
- **User reports multiple issues at once**: Capture each as a separate issue item, then investigate and resolve them one by one
- **Issue is unrelated to current task**: Still capture it but note it may need a separate task. Suggest `/plan-capture` for unrelated issues.
- **User provides fix suggestion with issue**: Capture the issue, consider the suggestion during investigation, implement the best solution
- **Observation step is first in remaining steps**: Include 1-2 preceding non-observation steps in the segment if available, or create a single-step segment
- **Multiple consecutive observation steps**: Each observation step ends its own segment — this may create several small segments, which is correct
- **User repeatedly says "Something's wrong"**: After 2 failed fix attempts, suggest manual investigation or `/plan-issue` and continue to the next segment
- **"Skip" for CI/non-interactive contexts**: The Skip option allows users in non-interactive or CI environments to bypass observation steps without blocking execution
- **Temptation to run full suite "just to be safe"**: Don't. Run only targeted tests for files you changed. If you're unsure which test files are relevant, run none rather than the full suite.
- **Step filter with all steps already complete**: "All filtered steps are already complete. Nothing to execute."
- **Step filter out of range**: "Step N is out of range (task has M steps)."
- **Step filter with no matching topic**: "No steps matching '[topic]' found in task #NNN."
- **Step filter with auto-capture description**: Ambiguous — discard filter, treat as description (auto-capture wins)
- **Step filter with multiple task IDs**: The same filter applies to each task independently (e.g., `/plan-execute 1 3 steps 2-4` runs steps 2-4 of task 1, then steps 2-4 of task 3)
- **Step filter "next batch" with no unchecked steps**: "All steps are already complete. Nothing to execute."
- **Step filter on pending (un-elaborated) task**: Filter is applied after auto-elaboration completes — the How steps must exist first
- **Step filter skips steps with dependencies**: Steps are executed as requested — the user is responsible for ensuring earlier steps are complete or unnecessary. Show a note: "Note: Skipping steps [list] — ensure their work is already done."
- **Multi-repo detected**: Parent directory is not a git repo but contains sub-repos — creates per-repo worktrees with a unified parent directory that mirrors the original layout
- **No matching sub-repos in task**: If task file paths don't match any sub-repo names, asks user which repos are relevant via `AskUserQuestion`
- **Some repos have no changes after execution**: Only commits where changes exist; deletes empty branches in repos with no changes
- **Single relevant repo in multi-repo mode**: Still uses parent-level worktree directory for consistency (unified layout is maintained)
- **Mixed git/non-git subdirs**: Non-git directories are symlinked as-is into the worktree directory; only git repos get actual worktrees
