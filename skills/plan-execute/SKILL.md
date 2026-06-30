---
name: plan-execute
disable-model-invocation: false
argument-hint: "<id|description> [steps N-M] [branch|worktree] [keep] [discuss]"
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
  - mcp__trello__get_card
description: Start or continue working on a task (auto-captures/elaborates if needed)
---

# plan-execute

Execute a task — start it if pending/elaborated, or resume if already in-progress. If given a description instead of an ID, auto-captures and auto-elaborates first. If a task exists but hasn't been elaborated, auto-elaborates inline. The AI actively implements the steps, writing code and making changes. When the project has an existing test suite, follow TDD (Test-Driven Development) practices.

## Execution Contract (read first — non-negotiable)

These rules bind every invocation. They are not subject to your judgment about the task.

1. **Follow the pipeline as written.** Never skip a step because the task seems trivial, small, or obvious — your sense of proportion is not an input. If `auto_capture` is set, you MUST run capture + elaborate (Step 3) before any implementation, even for a one-line change.
2. **All implementation goes through the plan-executor sub-agent** (Step 10/11). Never write code, edit files, or make changes directly from this skill. No exceptions for "quick" edits.
3. **`yolo` = run the full autonomous pipeline without the user.** It is NOT permission to take shortcuts. `yolo` implies `worktree_mode` + `branch_mode`: you MUST create the worktree (Step 11e). Doing *less* defeats the entire point.
4. **`yolo discuss` is intentionally NOT fully unattended.** When `discuss_mode` is set alongside `yolo`, the upfront clarifying gate (Step 3) runs FIRST as an open-ended, turn-by-turn conversation and pauses for the user until they say "go" (or "done" / "proceed"). Only after the gate exits does the autonomous pipeline run unattended. This is the one sanctioned pause before autonomy begins — it does not grant any other shortcuts.
5. **Finishing a worktree/`yolo` run sets status to `review`, not `completed`.** Leave the task file in `.plans/pending/`. Only `/plan-complete` sets `completed` and moves the file to `.plans/completed/`.
6. When in doubt, trust this skill over your own instinct about what "should" be necessary.

**Status → folder convention** (this skill never produces `completed`):

| Status | File location |
|---|---|
| pending, elaborated, in-progress, **review**, in-review | `.plans/pending/` |
| completed | `.plans/completed/` (set only by `/plan-complete`) |

> **RULE: Targeted tests only.** When running tests, ALWAYS scope to the specific files changed — never run the full test suite. Example: `rspec spec/models/user_spec.rb`, not `rspec`. `npm test -- user.test.js`, not `npm test`. The full suite is the user's responsibility.

## Arguments

- `$ARGUMENTS`: One or more task IDs, OR a task description, optionally followed by a branch keyword and/or step filter

**Parsing rules:**
- **Worktree keyword detection** (first) — set `worktree_mode = true` if `$ARGUMENTS` contains any of (case-insensitive): `worktree`, `use worktree`, `with worktree`
  - Strip worktree keywords from `$ARGUMENTS` before further parsing
  - `worktree_mode = true` implies `branch_mode = true` (worktrees always use branches)
- **YOLO keyword detection** (second) — set `yolo_mode = true` if `$ARGUMENTS` contains any of (case-insensitive): `yolo`, `yolo mode`, `autonomous`
  - Strip YOLO keywords from `$ARGUMENTS` before further parsing
  - `yolo_mode = true` implies `worktree_mode = true` AND `branch_mode = true` (autonomous execution always runs in an isolated worktree on its own branch)
- **Keep keyword detection** (after worktree/yolo detection, since keep governs worktree lifecycle) — set `keep_mode = true` if `$ARGUMENTS` contains any of (case-insensitive): `keep`, `keep worktree`, `keep wt`
  - Strip keep keywords from `$ARGUMENTS` before further parsing
  - `keep_mode = true` implies `worktree_mode = true` AND `branch_mode = true` (a kept worktree is still a worktree on its own branch — there is NO standalone-`keep` error path; it cascades exactly like `yolo`/`worktree`)
  - `keep` composes freely with `worktree` and `yolo` (e.g. `worktree keep`, `yolo keep`); it preserves the execution worktree past execution finish so `/plan-review` can review inside it, unlocking parallel review
- **Branch keyword detection** (third) — set `branch_mode = true` if `$ARGUMENTS` contains any of (case-insensitive): `branch`, `get branch`, `use branch`, `yes branch`
  - Strip branch keywords from `$ARGUMENTS` before further parsing
- **Discuss keyword detection** (after worktree/yolo/branch/step-filter detection) — set `discuss_mode = true` if any remaining token in `$ARGUMENTS` is (case-insensitive) `discuss`. This is a per-token flag, not an end-anchored phrase: strip the matched `discuss` token from `$ARGUMENTS` before further parsing. `discuss` composes freely with `worktree` / `branch` / `yolo` (e.g. `yolo discuss`).
- **Step filter detection** (fourth) — check for step selection directives. Set `step_filter` if found, and strip from `$ARGUMENTS` before further parsing.

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
- `/plan-execute 1 yolo` → run task 1 in yolo mode (autonomous, worktree, low-confidence assumptions tracked)
- `/plan-execute 1 worktree keep` → execute task 1 in a worktree, then PRESERVE the worktree (and its `**Worktree:**` field) at finish so it can be reviewed in place for parallel review
- `/plan-execute 1 yolo keep` → run task 1 autonomously in a worktree and keep the worktree afterward for parallel review (teardown deferred to `/plan-complete`)
- `/plan-execute https://trello.com/c/abc123 yolo` → ingest Trello card and run autonomously
- `/plan-execute "Some task" yolo` → autonomous execution on user-authored description
- `/plan-execute Fix bug discuss` → auto-capture, hold an upfront clarifying conversation, then auto-elaborate and execute
- `/plan-execute Fix bug yolo discuss` → auto-capture, run the clarifying gate first (pauses for the user), then the full autonomous yolo run
- `/plan-execute Fix bug branch discuss` → auto-capture, clarifying gate, then execute on a git branch

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Parse and resolve arguments**
   - Check for worktree keywords/phrases (see Arguments section) → store as `worktree_mode` flag (true/false). If true, also set `branch_mode = true`.
   - Strip worktree keywords from `$ARGUMENTS`
   - Check for YOLO keywords/phrases (see Arguments section) → store as `yolo_mode` flag (true/false). If true, also set `worktree_mode = true` AND `branch_mode = true`.
   - Strip YOLO keywords from `$ARGUMENTS`
   - **`yolo` does NOT grant discretion to skip steps.** You do not get to judge a task "too trivial" for capture/elaborate or for the worktree. See Execution Contract #1 and #3.
   - Check for keep keywords/phrases (see Arguments section) → store as `keep_mode` flag (true/false). If true, also set `worktree_mode = true` AND `branch_mode = true` (keep cascades like yolo — no standalone-keep error path).
   - Strip keep keywords from `$ARGUMENTS`. `keep` composes with `worktree` / `yolo` (e.g. `worktree keep`, `yolo keep`).
   - Check for branch keywords/phrases (see Arguments section) → store as `branch_mode` flag (true/false)
   - Strip branch keywords from `$ARGUMENTS`
   - Check for step filter (see Arguments section) → store as `step_filter` (or null if none found)
     - Check explicit patterns first: `steps? N`, `steps N-M`, `steps N,M,P`, `steps N-M,P`
     - Then check natural language patterns: `first/last/next N steps`, `first/last/next batch`, `the [topic] steps`, `up to step N`, `from step N`, `starting at step N`, `everything after step N`
     - Strip matched step filter text from `$ARGUMENTS`
   - Check for the `discuss` keyword (see Arguments section) → store as `discuss_mode` flag (true/false). It is a per-token, case-insensitive flag — set `discuss_mode = true` if any remaining token is `discuss`, then strip that token from `$ARGUMENTS`. `discuss` composes with `worktree` / `branch` / `yolo`.
   - Examine remaining tokens:
     - If ALL remaining tokens are numeric → task IDs. Zero-pad each to 3 digits, deduplicate → store as `task_ids` list. Set `auto_capture = false`.
     - If ANY remaining token is non-numeric AND `step_filter` is NOT set → the entire remaining string is a task description. Set `auto_capture = true`. Store as `capture_description`.
     - If ANY remaining token is non-numeric AND `step_filter` IS set → ambiguous. Discard `step_filter`, treat entire original remaining string as a description. Set `auto_capture = true`. (Step filters only work with existing task IDs.)
     - If nothing remains → `task_ids` is empty, `auto_capture = false`

2.5. **Normalize external content** (only if `auto_capture` is true AND `task_ids` is empty)

   When `capture_description` appears to be external content (a URL or pasted-text dump rather than a user-authored task description), fetch the source, extract a clean title + structured body, and rewrite `capture_description` before handing off to plan-capture. This step is skipped entirely when an existing task ID is being executed.

   Detection (apply in order; first match wins):

   - **Trello URL** — regex `https?://trello\.com/c/[a-zA-Z0-9]+`
     - Extract the card ID from the URL (the segment after `/c/`)
     - Call `mcp__trello__get_card` with that ID
     - Title = card's `name` field
     - Description = card's `desc` field, followed by checklist items (rendered as `- [ ]` / `- [x]` lines), followed by non-trivial comments. A "non-trivial comment" is one that is longer than ~20 characters and is not purely an acknowledgement (skip "+1", "thanks", emoji-only comments, and obviously bot-generated noise).
     - Set `source_kind = "trello"`
   - **GitHub issue URL** — regex `github\.com/[^/]+/[^/]+/issues/\d+`
     - Use `WebFetch` to retrieve the page
     - Extract the issue title and body from the returned content
     - Set `source_kind = "github-issue"`
   - **Linear URL** — regex `linear\.app/`
     - Use `WebFetch` to retrieve the page
     - Extract title and body from the returned content
     - Set `source_kind = "linear"`
   - **Pasted-text dump** — `capture_description` is more than 5 lines AND contains none of the recognized keywords (`branch`, `worktree`, `yolo`, `autonomous`, or any step-filter token). All URL detectors above must have already missed.
     - Title = the first non-empty line, truncated to roughly 100 characters at a word boundary
     - Description = the full original text
     - Set `source_kind = "pasted-text"`

   On any match, replace `capture_description` with:

   ```
   **Source:** [source_kind] [url-or-"pasted-text"]

   **Title:** [extracted title]

   [extracted description]
   ```

   `source_kind` is retained as a flag for downstream logging (state file entries, executor prompt context).

   **Failure handling:**
   - Trello fetch returns an error, empty card, or card with no usable description
   - WebFetch fails or returns content from which no title/body can be extracted
   - Any other extraction failure

   If `yolo_mode` is true: print `YOLO bailing to interactive: [reason]. Run /plan-capture manually.`, unset `yolo_mode` (and the implied `worktree_mode` / `branch_mode` flags it set), and STOP.

   If `yolo_mode` is false: print a warning like `Could not fetch external content ([reason]); passing raw description through.` and continue with the original unmodified `capture_description`.

   If none of the detectors match, this step is a no-op — `capture_description` flows through unchanged.

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

   **Clarifying discussion gate** (only if `discuss_mode` is true)

   This runs BETWEEN auto-capture and auto-elaborate. It is the front-loaded,
   options-first conversation. It runs INLINE in this session (NOT a spawned
   sub-agent — a sub-agent cannot hold a live turn-by-turn with the user) and is
   **EPHEMERAL**: it writes NOTHING to the task file. The agreed direction is
   carried in-context only, into the auto-elaborate step below.

   > **Canonical clarifying-gate spec** (embedded verbatim; the identical block
   > also lives in `plan-capture`'s chain — keep the two copies in sync):
   >
   > 1. **Scope guard** — the gate runs ONLY after a fresh auto-capture (v1). It is
   >    never offered for an existing task id; those are discussed with the standalone
   >    `/plan-discuss <id>`. (In this skill the guard is `auto_capture == true`; an
   >    existing task id never reaches the gate.)
   > 2. **Open with a compact pending-idea header** — there is no Why/How/Verification
   >    to quote yet (the task is freshly captured), so show only Title + What:
   >    ```
   >    Let's talk through #NNN before we plan it: [Title]
   >
   >    What: [the What / original description]
   >
   >    Here's what I think you're solving for — does that match? I'll float a couple
   >    of rough directions; push back on any of them. Say "go" (or "done" / "proceed")
   >    when you're ready and I'll fold what we settled into the plan.
   >    ```
   > 3. **Converse open-endedly** — reuse `plan-discuss` **step 6** (turn-by-turn;
   >    lead with options, not agreement; use `AskUserQuestion` for multiple-choice
   >    trade-offs and yes/no decisions; state a recommendation when you have one;
   >    don't just agree — surface trade-offs, missing cases, and alternative
   >    directions). Stay grounded in the raw idea. **Do NOT edit the task file.**
   > 4. **Detect exit signals** — reuse `plan-discuss` **step 8**, extended with the
   >    front-load exit words: "go", "proceed", "done", "that's enough", "let's plan
   >    it", "wrap up". On any exit signal, stop conversing and proceed.
   > 5. **Carry the agreed direction forward in-context** — summarize, for your own
   >    use only (do not write it anywhere), the direction the conversation settled on:
   >    scope decisions, chosen approach, rejected alternatives, constraints. This
   >    summary becomes starting context for the elaborate step.

   Print: `--- Discussing task #NNN before planning ---`, then run the gate per the
   spec above. When the user exits (says "go" / "done" / "proceed"), continue to
   auto-elaborate below. **For `yolo discuss`:** the gate is the one sanctioned pause
   — it runs open-ended until the user exits, and ONLY then does yolo's autonomy
   proceed unchanged (worktree creation at step 11e, deferred observations, ending in
   `review`). See Execution Contract #4.

   Then immediately auto-elaborate:

   Print: `--- Auto-elaborating task #NNN ---`

   If `discuss_mode` was true, feed the agreed direction from the gate above into
   elaboration as starting context — so the generated Why/How reflect what the
   conversation settled, not a cold read of the raw description.

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
     - `review` or `in-review`: Resume mode — set status back to `in-progress`. **First, check for a live kept worktree** (mirror the `in-progress` worktree-resume logic below):
       - If the task has a `**Worktree:**` field:
         - If the path exists: **auto-detect and reuse it** — set execution working directory to that path, set `worktree_mode = true` and `branch_mode = true`, and print `Resuming task #NNN inside kept worktree at [path].` Do NOT present the current-dir/new-worktree question (the kept worktree is the answer). If the task also has a `**Repos:**` field, set `multi_repo_mode = true` and parse it to restore `relevant_repos`.
         - If the path does NOT exist: warn `Kept worktree path no longer exists. Falling back to current directory or a new worktree.`, remove the stale `**Worktree:**` line from the task file (and `**Repos:**` line if present), then fall through to the question below.
       - **If there is NO live `**Worktree:**` field** (the default — task reviewed in main), use `AskUserQuestion` to ask if user wants worktree or current directory:
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
        - After step 7d completes: for each sub-repo in `relevant_repos`, apply the same pre-switch check before creating the branch:
          - Get sub-repo's current branch: `cd [sub-repo] && git rev-parse --abbrev-ref HEAD`
          - If it matches any in-progress task's `**Branch:**` field (excluding the task being started), determine that sub-repo's default branch (`git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'`, falling back to `main` then `master`) and run `cd [sub-repo] && git checkout [default-branch]`; print the same notice
          - Then create the branch: `cd [sub-repo] && git checkout -b [branch-name]`
        - Branch metadata format: `**Branch:** [branch-name] (multi-repo: [comma-separated repo names])`
      - Determine branch type from task type:
        - `bug` → "fix"
        - `feature` → "feature"
        - `refactor` → "refactor"
        - `chore` → "chore"
      - Generate suggested branch name: `[type]/NNN-[slug]` (e.g., `feature/001-add-dark-mode`)
      - **Pre-switch off other in-progress task branches** (single-repo path only):
        - Get current branch: `git rev-parse --abbrev-ref HEAD`
        - Scan `.plans/pending/*.md` for files with `Status: in-progress` (excluding the task being started)
        - For each, extract the `**Branch:**` field value (if present)
        - If current branch matches any of those branch values:
          - Determine default branch: `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'`; if empty, try `main`, then `master`
          - Run `git checkout [default-branch]`
          - Print: `Current branch belongs to in-progress task #MMM. Switched to [default-branch] before creating new branch.`
        - If current branch does not match any in-progress task branch, do nothing — branch from the current checkout as before
      - **Auto-accept shortcut:** If `branch_mode` is true OR `yolo_mode` is true (both set in step 2; yolo implies branch_mode but we list both for clarity), skip the question and immediately create the suggested branch — no `AskUserQuestion` needed.
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

   h. **Commit .plans/ changes**
      - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
      - If not a git repo: skip silently
      - Check if `.plans/` is gitignored: `git check-ignore -q .plans 2>/dev/null`
      - If exit code 0 (ignored): skip silently
      - Read `.plans/config.json` for `git_commits` setting
      - If `git_commits` is not `true`: skip silently
      - Check for uncommitted changes in .plans/: `git status --porcelain .plans/`
      - If no changes: skip silently
      - Commit:
        ```bash
        git add .plans/
        git commit -m "plan: start #NNN - [title]"
        ```
      - If commit fails (e.g. hooks): warn but do not fail the skill

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

   **Read the build route (if any):** Look for a `**Build:**` field in the task header (alongside `**Type:**` / `**Status:**`). It has the form `<skill> · <unit1>, <unit2>, ...` (e.g. `**Build:** des-build · CaseStudyCarousel, ContentModule`). If present and the skill is `des-build`, set `build_route = { skill: "des-build", units: [<unit1>, ...] }`; otherwise `build_route = null`. This field is read **only** from the header — never inferred from the task body. (Routing is applied in Steps 10–11.)

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
   Build route: [des-build → unit1, unit2]            ← only show if build_route is set
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

   **Reminder (Execution Contract #2): ALL implementation work goes through the plan-executor sub-agent — never edit directly. The ONE exception is the build-skill route below: when `build_route` is set, the named build units are handed to the build skill (which this orchestrator can invoke via the Skill tool — a sub-agent cannot), not to the plan-executor.**

   **Detect build-skill routing**

   Using `build_route` read in Step 9 (the parsed `**Build:**` header field — never inferred from task body):
   - If `build_route` is null → behavior is unchanged. Proceed to step-filter resolution and normal segmentation below.
   - If `build_route` is set (skill `des-build`, with one or more named units) → those units are built by invoking the des-build skill directly in Step 11 (the "Build-skill route" branch), NOT by the plan-executor sub-agent. The build units do not enter generic segmentation. Any How steps that are NOT part of building those units still segment and run through the normal plan-executor loop (see "Mixed tasks" in Step 11).

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

   **Build-skill route (run this BEFORE the plan-executor path below — only when `build_route` is set):**

   When `build_route` is set (from Steps 9–10), the named build units are built by invoking the build skill directly from this orchestrator (which holds the Skill tool — a plan-executor sub-agent does not), NOT by spawning plan-executor. For `build_route.skill == "des-build"`:

   - **Iterate one des-build call per unit**, in listed order (des-build builds a single component/section at a time, and a later unit may need an earlier one to already exist). For each unit:
     - Invoke the des-build skill via the **Skill tool**: `skill: "des-build"`, `args: "<unit name>"` (append ` verify` when the task's Verification or How asks for a self-verify pass against the Figma frame).
     - The orchestrator's working directory is already the worktree when `worktree_mode` is true (set in Step 7e), so des-build writes into the worktree automatically — no path threading needed.
     - **Autonomous deferral (mirror of the observation-step rule below):** when `worktree_mode` is true OR `yolo_mode` is true, the invocation prompt MUST instruct des-build to NOT pause with AskUserQuestion for non-linear desktop↔mobile reflow — it records the chosen interpretation as a noted assumption and continues, deferring the choice to review. When both are false, des-build may pause and ask normally.
   - **After each unit completes:**
     - Mark the corresponding How-step checkbox(es) for that unit complete (`- [x]`).
     - Append to the task's `## Changes` section: the unit built, the files written, the tokens/global classes used, and any drift/styleguide flags des-build surfaced.
     - Record a line in the state file `## Key Decisions` (e.g. `- Built <unit> via des-build skill; surfaced N flags`), and any deferred reflow interpretation in the state file `## Observations` section as `- <unit>: ⏳ reflow interpretation deferred to review`.
   - **Mixed tasks:** any remaining unchecked How steps that are NOT part of building these units still run through the normal plan-executor segment loop below — resolve the step filter / segmentation over those remaining steps as usual. If every step is covered by build units, skip the plan-executor loop entirely.
   - After the build route (and any remaining plan-executor segments) complete, fall through to the same finish handling (Step 11d non-worktree / Step 11e worktree) and state-setting rules — a des-build-routed task lands in `review` (worktree) or stays `in-progress` (non-worktree) exactly like any other execution.

   **MANDATORY: Spawn plan-executor sub-agent for ALL implementation work (the build-skill route above is the sole exception).**

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
      - **Assumptions written during execution:** Read the task file's `## Assumptions > Discovered during execution` subsection. Diff against any bullets that were already present before this segment ran (track the prior bullet count in the state file's `## Key Decisions` section as `assumptions_seen_before_segment_N: M`). Any newly-appended bullets are this segment's contribution — log a short summary line to the state file's `## Key Decisions` section, e.g. `- Segment N appended 2 assumption bullets (1 low, 1 high); see task file ## Assumptions for details.`

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

      **If `worktree_mode` is true OR `yolo_mode` is true — defer observation to review:**
      (yolo_mode implies worktree_mode transitively, but we list both explicitly so the deferral guarantee is self-documenting.)
      - Do NOT pause with AskUserQuestion
      - Check if later steps depend on this observation (instrumentation dependency rule applied during segmentation, or step language like "based on what you saw", "if the output shows"):
        - If dependent: Record in state file Observations section: `- Step N: ⏳ Deferred to review (⚠ later steps depend on this — agent proceeded with plan assumptions)`
        - If not dependent: Record in state file Observations section: `- Step N: ⏳ Deferred to review`
      - Continue to next segment

      **If `worktree_mode` is false AND `yolo_mode` is false — MUST pause for user feedback:**

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

   ## Assumptions to Track

   As you work, watch for low-confidence decisions and write them into the task file's `## Assumptions > Discovered during execution` section. Append a bullet for each, tagged `- [high]` or `- [low]`:

   Low-confidence triggers (write `- [low]`):
   - You picked between 2+ plausible implementations
   - You guessed at an API/field/data shape that wasn't documented in the task
   - You made a UX call the task didn't specify
   - You made a scope call (full fix vs. workaround, refactor scope, etc.)
   - You used a library/pattern not already present in the project

   High-confidence note (write `- [high]`):
   - You made a clear pattern-match decision worth documenting (existing precedent in the codebase, single plausible path)

   Format: `- [high|low] [what you decided]. **Why:** [reasoning]`

   Write these BEFORE returning your structured response. The reviewer will see them at the top of `/plan-review NNN` output.
   ```

   **d. After all segments complete**

   - **If `worktree_mode` is true OR `yolo_mode` is true:** proceed to worktree finish (step 11e) instead of showing the normal summary. (yolo implies worktree transitively; listed explicitly so the review-status path is self-documenting.)
   - **Otherwise:** show completion summary.

     Before printing, read the task file's `## Verification` section. If it contains real content (not just the `_To be filled during elaboration_` placeholder), render each non-empty line as a `-` bullet under `**How to verify:**`. Cap at 4 bullets — if Verification is longer, pick the most concrete user-observable checks (prefer behavioral/UI checks the user can run now over abstract criteria). If Verification is empty/placeholder, use the single fallback bullet: `- Manually exercise the changes in this checkout`.

     Print EXACTLY this format:
     ```
     All segments complete for task #NNN

     Segments: N executed | Deviations: [count] (see state file)

     **How to verify:**
     [bullets from Verification section, or fallback]

     **Next:** /plan-complete NNN
     ```
     End-of-action marker (final line): `🟢 EXECUTED · Task #NNN → Next: /plan-complete NNN`
     (If execution paused mid-task awaiting user input rather than finishing, emit `⏸️ PAUSED · Task #NNN → Next: /plan-execute NNN to resume` instead.)
   - Keep state file for reference (don't delete)

   **e. Worktree finish** (only if `worktree_mode` is true OR `yolo_mode` is true — runs after all segments complete)

   **Single-repo path** (when `multi_repo_mode` is false):

   1. Commit any uncommitted changes in worktree:
      ```bash
      cd [worktree-path] && git add -A && git status --porcelain
      ```
      If there are uncommitted changes:
      ```bash
      cd [worktree-path] && git commit -m "plan: complete work on task #NNN - [title]"
      ```
   2. Set task status to `review` (NOT `completed`, NOT `in-progress`). The task file STAYS in `.plans/pending/` — do NOT move it to `.plans/completed/`. Only `/plan-complete` sets `completed` and moves the file. (See Execution Contract.)

   **Teardown gate (depends on `keep_mode`):**

   - **If `keep_mode` is FALSE (default — behavior unchanged):**
     3. Return to project root: `cd [project-root]`
     4. Remove worktree: `git worktree remove .worktrees/NNN-slug`
        - If remove fails (dirty worktree), force it: `git worktree remove --force .worktrees/NNN-slug`
     5. Remove `**Worktree:**` line from task file (branch metadata stays)
   - **If `keep_mode` is TRUE — PRESERVE the worktree:**
     3. **Skip `git worktree remove`** — the worktree stays on disk.
     4. **Keep the `**Worktree:**` line** on the task file (it is the live signal `/plan-review` and other lifecycle skills read to review inside the worktree, enabling parallel review). Branch metadata also stays.
     5. Teardown of this kept worktree is deferred to `/plan-complete` (after merge).

   **Invariant after this step:** The task's commits live on branch `[branch-name]` in the main repository's `.git` — `git worktree add` only created a separate checkout, so the branch and its commits persist regardless of whether the worktree is removed. **When `keep_mode` is FALSE:** the worktree is gone and you are in the main project directory (`[project-root]`); subsequent commands (`/plan-review`, `/plan-complete`) operate on this branch from there — do NOT `cd` back into `.worktrees/NNN-slug` (it no longer exists) and do NOT assume the work needs to be "brought back" from anywhere. **When `keep_mode` is TRUE:** the worktree still exists and the task retains its `**Worktree:**` field; you remain in the worktree-aware state and downstream skills review *inside* that worktree rather than checking the branch out into main.
   6. Skip steps 12-14 (testing/feedback loop) — worktree workflow defers this to `/plan-review`. This skip applies equally when `yolo_mode` is true (which always implies `worktree_mode`).
   7. Show worktree completion summary.

      Before printing, read the task file's `## Verification` section. If it contains real content (not just the `_To be filled during elaboration_` placeholder), render each non-empty line as a `-` bullet under `**How to verify:**`. Cap at 4 bullets — if Verification is longer, pick the most concrete user-observable checks (prefer behavioral/UI checks the user can run now over abstract criteria). If Verification is empty/placeholder, use the single fallback bullet: `- Run /plan-review NNN and walk through the diff`.

      Print EXACTLY this format and STOP (the `Worktree:` line depends on `keep_mode` — see below):
      ```
      All segments complete for task #NNN (worktree mode)

      Branch: [branch-name] (ready for review)
      Worktree: cleaned up

      **How to verify:**
      [bullets from Verification section, or fallback]

      **Next:** /plan-review NNN
      ```
      **`Worktree:` line:** when `keep_mode` is FALSE, print `Worktree: cleaned up` as shown. When `keep_mode` is TRUE, print `Worktree: kept at [absolute-worktree-path] for parallel review` instead.
      **If `yolo_mode` is true,** insert one additional line BEFORE the `**How to verify:**` block (right after the `Worktree:` line):
      ```
      YOLO assumptions logged — see /plan-review NNN for low-confidence items.
      ```
      Then add the end-of-action marker as the final line:
      `🟢 EXECUTED · Task #NNN → Next: /plan-review NNN`
      **STOP after the marker line.** The branch lives in this repo; /plan-review NNN handles the rest from the main project directory — no manual merge/checkout needed.

   **Multi-repo path** (when `multi_repo_mode` is true):

   1. For each repo in `relevant_repos`:
      - Check for changes: `cd .worktrees/NNN-slug/[repo-name] && git status --porcelain`
      - If changes exist: `git add -A && git commit -m "plan: complete work on task #NNN - [title]"`
      - Track which repos had changes in `repos_with_changes` list
   2. Return to parent directory

   **Teardown gate (depends on `keep_mode`):**

   - **If `keep_mode` is FALSE (default — behavior unchanged):**
     3. For each repo in `relevant_repos`:
        - Remove worktree: `cd [repo-name] && git worktree remove .worktrees/NNN-slug`
          - If remove fails, force it: `git worktree remove --force .worktrees/NNN-slug`
        - If repo had NO changes committed: clean up empty branch: `git branch -d [branch-name]`
     4. Remove parent-level worktree directory: `rm -rf .worktrees/NNN-slug`
        - If `.worktrees/` is now empty, remove it too: `rmdir .worktrees 2>/dev/null`
   - **If `keep_mode` is TRUE — PRESERVE the worktree tree:**
     3. **Skip the per-repo `git worktree remove`** for every repo in `relevant_repos` — each per-repo worktree stays on disk.
     4. **Skip `rm -rf .worktrees/NNN-slug`** (and the `rmdir .worktrees`) — preserve the whole symlinked parent `.worktrees/NNN-slug/` tree intact, including the per-repo symlinks and the `.plans` symlink.
     5. Teardown of this kept worktree tree is deferred to `/plan-complete` (after merge).

   **Invariant after this step:** For each repo in `relevant_repos`, the task's commits live on branch `[branch-name]` inside that repo's `.git` — they persist regardless of whether the worktree is removed. **When `keep_mode` is FALSE:** the `.worktrees/NNN-slug/` tree has been fully removed and you are back in the parent project directory; all subsequent commands run from the main project directory against those per-repo branches — do NOT assume work needs to be moved out of the (now-deleted) worktree. **When `keep_mode` is TRUE:** the `.worktrees/NNN-slug/` tree (and each per-repo worktree) still exists and the task retains its `**Worktree:**` and `**Repos:**` fields; downstream skills review *inside* that worktree tree rather than checking the branches out into main.

   5. Set task status to `review` (NOT `completed`, NOT `in-progress`). The task file STAYS in `.plans/pending/` — do NOT move it to `.plans/completed/`. Only `/plan-complete` sets `completed` and moves the file. (See Execution Contract.)
   6. **When `keep_mode` is FALSE:** remove the `**Worktree:**` line from the task file. **Keep the `**Repos:**` line** — it records which sub-repos this task touched and is now consumed by `/plan-review` (the review-concurrency guard plus per-repo checkout/rebase/diff) and `/plan-pause` (per-repo branch unwind). Branch metadata also stays. **When `keep_mode` is TRUE:** keep BOTH the `**Worktree:**` line (the live signal for in-worktree review) and the `**Repos:**` line; branch metadata also stays.
   7. Skip steps 12-14 (testing/feedback loop) — worktree workflow defers this to `/plan-review`. This skip applies equally when `yolo_mode` is true (which always implies `worktree_mode`).
   8. Show worktree completion summary.

      Before printing, read the task file's `## Verification` section. If it contains real content (not just the `_To be filled during elaboration_` placeholder), render each non-empty line as a `-` bullet under `**How to verify:**`. Cap at 4 bullets — if Verification is longer, pick the most concrete user-observable checks (prefer behavioral/UI checks the user can run now over abstract criteria). If Verification is empty/placeholder, use the single fallback bullet: `- Run /plan-review NNN and walk through the diff`.

      Print EXACTLY this format and STOP (the `Worktree:` line depends on `keep_mode` — see below):
      ```
      All segments complete for task #NNN (worktree mode)

      Branch: [branch-name] (ready for review)
      Repos with changes: [repos_with_changes list, or "none"]
      Worktree: cleaned up

      **How to verify:**
      [bullets from Verification section, or fallback]

      **Next:** /plan-review NNN
      ```
      **`Worktree:` line:** when `keep_mode` is FALSE, print `Worktree: cleaned up` as shown. When `keep_mode` is TRUE, print `Worktree: kept at [absolute-path-to-.worktrees/NNN-slug] for parallel review` instead.
      **If `yolo_mode` is true,** insert one additional line BEFORE the `**How to verify:**` block (right after the `Worktree:` line):
      ```
      YOLO assumptions logged — see /plan-review NNN for low-confidence items.
      ```
      Then add the end-of-action marker as the final line:
      `🟢 EXECUTED · Task #NNN → Next: /plan-review NNN`
      **STOP after the marker line.** The branch lives in each affected repo; /plan-review NNN handles the rest from the main project directory — no manual merge/checkout needed.

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

15. **Commit .plans/ changes** (after execution completes or pauses)
    - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
    - If not a git repo: skip silently
    - Check if `.plans/` is gitignored: `git check-ignore -q .plans 2>/dev/null`
    - If exit code 0 (ignored): skip silently
    - Read `.plans/config.json` for `git_commits` setting
    - If `git_commits` is not `true`: skip silently
    - Check for uncommitted changes in .plans/: `git status --porcelain .plans/`
    - If no changes: skip silently
    - Commit:
      ```bash
      git add .plans/
      git commit -m "plan: update tracking for #NNN - [title]"
      ```
    - If commit fails (e.g. hooks): warn but do not fail the skill

16. **Periodic status** (when pausing mid-execution)

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

17. **Display multi-task summary**

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

    End-of-action marker (final line): `🟢 EXECUTED · N tasks → Next: /plan-complete <ids>`

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
- **Trello fetch fails (auth, private board, deleted card)**: Print `YOLO bailing to interactive: Trello fetch failed ([error]). Run /plan-capture manually.`, unset `yolo_mode` (and the implied `worktree_mode` / `branch_mode` it set), and stop. If `yolo_mode` was not set, just print a warning and pass the raw `$ARGUMENTS` through to plan-capture as-is.
- **Empty Trello description**: Print `YOLO bailing to interactive: Trello card has no description. Run /plan-capture manually.`, unset yolo flags, and stop (same shape as the fetch-failure bail). If `yolo_mode` was not set, warn and pass raw description through.
- **Research sub-agent reports zero relevant files in yolo mode**: Executing on a plan that can't find relevant code is a footgun. Bail out of autonomous mode: unset `yolo_mode`, fall back to interactive elaboration, and prompt the user for guidance on where the relevant code lives.
- **`yolo` keyword with no external content**: `/plan-execute "Fix bug" yolo` is valid. Skips step 2.5 external-content normalization (no URL/dump detected) and runs the autonomous flow on user-authored text. No bail.
- **`yolo` keyword with existing task ID**: `/plan-execute 5 yolo` is valid. Skips step 2.5 entirely (input is a task ID, not external content) and runs autonomous execution on the existing task. No bail.
- **`discuss` only fires with auto-capture**: The clarifying gate (step 3) runs ONLY when `auto_capture` is true — i.e. a fresh description was given (v1 scope). `discuss` with an existing task id (`/plan-execute 5 discuss`) does NOT trigger the gate; the flag is effectively a no-op. Point the user to the standalone `/plan-discuss 5` to discuss an existing task.
- **`yolo discuss`**: Valid and intentional. The clarifying gate runs FIRST (open-ended, turn-by-turn, until the user says "go"/"done"/"proceed"), THEN the full autonomous yolo pipeline proceeds unchanged (worktree at step 11e, deferred observations, ending in `review`). This is the one sanctioned pause before autonomy — `yolo discuss` is intentionally NOT fully unattended. See Execution Contract #4.
- **`discuss` composes with `branch` / `worktree`**: `/plan-execute Fix bug branch discuss` and `/plan-execute Fix bug worktree discuss` both run the gate after auto-capture, then carry the agreed direction into auto-elaborate, then execute with the requested branch/worktree mode. Keyword order does not matter.
