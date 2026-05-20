---
name: plan-spawn
disable-model-invocation: true
argument-hint: "<id> <id> [<id>...]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Task
description: Run multiple tasks in parallel, each in its own worktree (always autonomous/yolo)
---

# plan-spawn

Run two or more elaborated tasks in parallel. plan-spawn **is** the orchestrator: it runs in the main conversation and replicates plan-execute's orchestration itself — preflight, skip-mode elaboration, branch + worktree creation, status transitions, state files, PROGRESS.md updates, and worktree finish/cleanup. It delegates only the IMPLEMENTATION work of each segment to the real `plan-executor` agent (`subagent_type: "plan-executor"`), exactly as plan-execute does. Parallelism comes from running multiple tasks' segments concurrently in rounds — not from wrapping plan-execute in a sub-agent (a sub-agent has no Skill tool and cannot invoke `/plan-execute`).

Every task runs in its own isolated git worktree on its own branch, in autonomous (yolo) mode — skip-mode elaboration if needed, deferred observations, and low-confidence assumptions logged for review.

Spawn is **always** autonomous + worktree + branch. There is no interactive variant. For a single task with prompts, use `/plan-execute NNN` instead. For a single task autonomously, use `/plan-execute NNN yolo worktree`.

## Arguments

- `$ARGUMENTS`: Two or more numeric task IDs separated by spaces (e.g. `1 3 5`, `001 002 007`).

**Parsing rules:**
- Extract every numeric token; zero-pad each to 3 digits; deduplicate while preserving order.
- The keywords `yolo`, `worktree`, `autonomous` are accepted silently and stripped — they are always implied. Do not warn the user.
- Step-filter tokens (`steps`, `step`, `first`, `next`, `last`, `batch`, `diagnostic`, ranges like `3-5`) → print a warning: `Spawn runs whole tasks; step filter ignored.` Continue with the IDs.
- Any other non-numeric token → error: `Spawn only accepts numeric task IDs. Got: [token]`
- If fewer than 2 unique IDs remain → see Edge Cases.

**Examples:**
- `/plan-spawn 1 3 5` → spawn tasks 001, 003, 005 in parallel
- `/plan-spawn 001 002 007 yolo` → same as above (yolo is implied/silent)
- `/plan-spawn 5` → error: spawn requires 2+ tasks

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Parse arguments**
   - Strip silent keywords (`yolo`, `worktree`, `autonomous`) — no warning.
   - Detect and warn-then-strip step-filter language (see Arguments).
   - Extract numeric tokens, zero-pad to 3 digits, deduplicate.
   - If fewer than 2 unique IDs remain:
     - If exactly 1 ID: error `Spawn requires 2+ tasks. For a single task, use \`/plan-execute NNN worktree yolo\`.`
     - If 0 IDs: error `Spawn requires 2+ task IDs. Example: /plan-spawn 1 3 5`
   - Read `.plans/config.json` once and remember `git_commits` for the post-spawn reconciliation step.

3. **Preflight (sequential — no work yet)**

   **Read shared, read-only inputs once, up front.** Both of these are the same for every task, so reading them once here avoids re-reading them during per-task orchestration:
   - Read `.plans/CONTEXT.md` and hold its content in memory. An abbreviated version (tech stack, key patterns, testing info) is injected into every `plan-executor` segment prompt later.
   - Detect the test suite **once**, using plan-execute step 8's detection logic (Ruby/RSpec, JavaScript/TypeScript, Python, Go, or any generic `test/` `tests/` `spec/` directory). Remember `has_tests` and the test command(s) — they go into every segment prompt's `## Test Suite` block.

   Then, for each task ID in order:
   - Locate the task file at `.plans/pending/NNN-*.md`.
     - If not found: abort the whole spawn with `Task #NNN not found. Aborting spawn — no tasks were started.`
   - Read the task file. Extract Title, Type, and Status.
   - If Status is `in-progress`, `review`, `in-review`, or `completed`: add the ID + status to an `offenders` list (do not abort yet — collect them all so the user sees the full list).
   - Check whether `.worktrees/NNN-slug/` already exists at the project root (where `NNN-slug` matches the task's filename stem). If so, add to a `worktree_collisions` list.

   After scanning all tasks:
   - If `offenders` is non-empty, abort:
     ```
     Cannot spawn — these tasks are not in a spawnable state:
     - #NNN ([status]): [title]
     ...
     Spawnable statuses are: pending, elaborated.
     ```
   - If `worktree_collisions` is non-empty, abort:
     ```
     Worktree path collision — clean up before retrying:
     - .worktrees/NNN-slug (task #NNN)
     ...
     For each: `git worktree remove --force .worktrees/NNN-slug` (then `rm -rf .worktrees/NNN-slug` if the directory remains).
     ```

4. **Auto-elaborate any pending tasks (sequential, skip-mode)**

   For each task whose Status is `pending`, in order:
   - Invoke `/plan-elaborate NNN skip` **directly from the main conversation** using the Skill tool. Do NOT delegate this to a spawned `general-purpose` agent — sub-agents have no Skill tool, and plan-spawn runs in the main conversation where it does. Skip mode in `/plan-elaborate` auto-accepts every prompt — see plan-elaborate's Arguments section. (plan-execute's own auto-elaborate paths invoke elaboration inline too.)
   - After it returns, confirm the task file Status is now `elaborated`. If elaboration failed (Status not updated, or the skill reported an error), abort the whole spawn:
     ```
     Skip-mode elaboration failed for #NNN: [reason]
     Aborting spawn. Other tasks left untouched — re-run /plan-spawn after resolving.
     ```
   - Do not parallelize elaboration. Sequential keeps abort-on-failure clean and avoids racing on `.plans/config.json` writes (next_id, PROGRESS.md).

   Tasks already at `elaborated` status are left alone.

5. **Confirm gate**

   **MUST use `AskUserQuestion` tool** — do not auto-accept, do not infer.

   Build the option preview text. For each task, compute the branch name `[type-map]/NNN-[slug]` where `type-map` is: `bug→fix`, `feature→feature`, `refactor→refactor`, `chore→chore` (same mapping as plan-execute step 7c).

   Call `AskUserQuestion`:
   - Header: `"Spawn N tasks"`
   - Question: (multi-line)
     ```
     About to spawn N tasks in parallel, each in its own worktree on its own branch.
     plan-spawn creates each branch + worktree itself, then runs the tasks' segments
     concurrently via plan-executor agents:

     - #NNN — [title] → [branch-name]
     - #NNN — [title] → [branch-name]
     - ...

     All tasks run autonomously (yolo): skip-mode elaboration, deferred observations,
     low-confidence assumptions logged for review.

     ⚠ Overlapping files between parallel tasks will surface as merge/rebase conflicts
     at review time — spawn does not detect overlap up-front.

     Proceed?
     ```
   - Options:
     1. "Spawn all" (description: "Launch all N tasks in parallel worktrees")
     2. "Cancel" (description: "Abort — no changes made")

   If user picks "Cancel": exit cleanly with `Spawn cancelled. No tasks were started.` Do NOT roll anything back — any skip-mode elaborations from step 4 stay (they're valuable on their own).

6. **Per-task setup (sequential across tasks — plan-spawn does this itself)**

   plan-spawn performs all branch/worktree/state setup **itself in the main conversation**, **serialized across tasks**. Git operations mutate the shared repo `.git` (`git checkout -b`, `git worktree add`) and must NOT interleave — do one task's full setup before starting the next. Nothing is delegated to a sub-agent here.

   For each task, in sequence:

   **a. Create the branch** — follow plan-execute step 7c exactly.
   - Determine branch type from task type via the type-map: `bug → fix`, `feature → feature`, `refactor → refactor`, `chore → chore`.
   - Branch name: `[type]/NNN-[slug]` where `NNN-slug` is the task filename stem.
   - Spawn always implies worktree mode, so the branch is created via the worktree command in step 6b — do not also run a bare `git checkout -b`.

   **b. Create the worktree** — follow plan-execute step 7e's single-repo command sequence exactly:
   1. Get project root: `git rev-parse --show-toplevel`.
   2. Create the worktree (this also creates the branch):
      ```bash
      git worktree add .worktrees/NNN-slug -b [branch-name]
      ```
   3. Ensure `.worktrees/` is in `.gitignore` — read `.gitignore` (create if missing); append `.worktrees/` if not already present.
   4. Symlink the shared `.plans/` into the worktree:
      ```bash
      ln -s [project-root]/.plans [worktree-path]/.plans
      ```

   **c. Add metadata to the task file** — below the Status line, add:
   ```
   **Branch:** [branch-name]
   **Worktree:** [absolute-worktree-path]
   ```

   **d. Set the task file Status** to `in-progress`.

   **e. Create the state file** at `.plans/state/NNN-state.md` using plan-execute step 11a's format:
   ```markdown
   # Execution State: Task #NNN

   **Task:** [Title]
   **Branch:** [branch-name]
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

   **f. Segment the task's unchecked How steps** into segments of 3-4 steps each, following plan-execute step 10's segmentation rules:
   - Group unchecked steps into segments of 3-4 steps.
   - **Observation step rule:** an observation step MUST be the last step in its segment (split mid-segment observations; consecutive observation steps each end their own segment).
   - **Instrumentation dependency rule:** if a step adds instrumentation/logging/debugging and a later step implements a fix informed by it, they MUST be in different segments with the instrumentation step ending its segment.
   - Identify observation steps via the `👁` marker or the keyword heuristics in plan-execute step 10.
   - Store this task's segment plan (segment list + per-segment step ranges) **in memory** — the orchestrator holds every task's segment plan for the interleaved segment-execution loop in the next step. Reflect the segment list in the state file's `## Segments` section (step 6e).

   **End state of this step:** every task now has a branch, a worktree, `in-progress` status, a state file, and a computed segment plan held in memory. No implementation work has run yet. The orchestrator is ready for the interleaved segment-execution loop documented in the next step.

7. **Interleaved segment-execution loop (the core of spawn)**

   This is where implementation work actually runs. plan-spawn is the orchestrator: it spawns `plan-executor` agents — never `general-purpose` agents, never anything that needs the Skill tool. Parallelism comes from spawning multiple tasks' segments **in the same assistant message** so they run concurrently.

   **a. Compute the round count**

   `max_segments = max over all tasks of (that task's segment count)` — using the segment plans computed in step 6f. Tasks with fewer segments simply have no work in later rounds.

   **b. Run rounds 1..max_segments**

   For each `round` from 1 to `max_segments`:

   1. Build the set of tasks that have work this round: every task that (a) still has a pending segment at index `round`, AND (b) has not been marked `blocked` in an earlier round. Skip any task that has no segment at this index or is already blocked.

   2. **In a SINGLE assistant message, spawn one `plan-executor` Task call for every task in that set.** Multiple `Task` calls in one message run concurrently — that concurrency *is* the parallelism. Each call uses:
      ```
      subagent_type: "plan-executor"
      model: "opus"
      prompt: [segment execution prompt — see plan-execute step 11c's template]
      ```

   3. **Per-task prompt construction.** Use plan-execute step 11c's segment execution prompt template, with these fields substituted **per task** (each task gets its own prompt scoped to its own worktree):
      - `## Task Context` — that task's ID, Title, Type, Branch, and **Worktree:** line set to *that task's* `.worktrees/NNN-slug` absolute path. The worktree line MUST instruct the agent to prefix all bash commands with `cd [that-worktree-path] &&` — work for task A must never touch task B's worktree.
      - `## Project Context` — the abbreviated CONTEXT.md content read once in step 3 (same text for every task).
      - `## Previous Work (from earlier segments)` — read from *that task's* `.plans/state/NNN-state.md`: its completed steps, key decisions, and relevant context. For round 1 this is empty (`_None yet_`).
      - `## Your Segment` — that task's segment at index `round`, listed as the unchecked `- [ ]` step lines from the task file's How section.
      - `## Test Suite` — the `has_tests` flag + test command(s) detected once in step 3 (same for every task).
      - `## Impact Scope` — that task's own Impact Scope section.
      - `## Observation Steps` — include this block only if that task's round-`round` segment ends on an observation step (per the segmentation in step 6f).
      - `## Assumptions to Track` — the standard block from the template; assumptions go into *that task's* task file.

   4. **Await all Task calls in the round** before doing any reconciliation. Do not begin reconciling task A while task B's agent is still running.

   5. **Sequentially reconcile each returned result** — one task at a time, never interleaved (there is no shared file written here, but the sequential discipline keeps it that way). For each task's `plan-executor` response (the structured `Completed / Decisions Made / Deviations / Blockers / Test Status` format from `agents/plan-executor.md`):
      - **Update that task's state file** (`.plans/state/NNN-state.md`): mark the round-`round` segment `complete`, append its completed steps to `## Completed Steps`, add decisions to `## Key Decisions`, add deviations to `## Deviations`, update `## Test Status`.
      - **Update that task's task file**: check off the segment's How checkboxes (`- [ ]` → `- [x]`), append the agent's reported changes to the `## Changes` section.
      - **Record deferred observations.** Worktree mode is *always* on for spawn, so observations are **always deferred, never prompted** (per plan-execute step 11b.6). If the segment's last step was an observation step, write to that task's state file `## Observations` section: `- Step N: ⏳ Deferred to review` — or, if a later step depends on it, `- Step N: ⏳ Deferred to review (⚠ later steps depend on this — agent proceeded with plan assumptions)`. Never call `AskUserQuestion` for an observation here.
      - **Log the assumption-bullet diff** (per plan-execute step 11b.3): read that task file's `## Assumptions > Discovered during execution` subsection, diff against the prior bullet count tracked in the state file's `## Key Decisions` section (`assumptions_seen_before_segment_N: M`), and log a one-line summary of newly-appended bullets, e.g. `- Segment N appended 2 assumption bullets (1 low, 1 high); see task file ## Assumptions for details.`

   6. **Blocker handling — per task, not per batch.** If a task's `plan-executor` returns a non-empty `Blockers` section:
      - Record that task's round-`round` segment as `blocked` in its state file, and mark the task's outcome `blocked`.
      - Stop spawning further segments for **that task only** — it gets no Task call in subsequent rounds.
      - **Every other task continues its rounds normally.** There is no `AskUserQuestion` blocker gate here (unlike plan-execute step 11b.7) — spawn is autonomous, so a blocker just stops one task and the batch rolls on. The blocked task surfaces in the final summary table.

   **c. Concurrency-safety rules (why this is race-free)**

   - **`.plans/config.json` is read exactly once, up front (step 2), and NEVER re-read mid-loop.** No round reads or writes it.
   - **`.plans/` is NEVER committed mid-loop.** The single `.plans/` commit is deferred to post-spawn reconciliation (step 8). Rounds only write per-task files.
   - **Per-task artifacts are isolated.** Each task has its own state file, its own task file, its own branch, its own worktree. Parallel `plan-executor` agents in a round each touch only their own worktree and (via plan-spawn's reconciliation) their own state/task file — never a sibling's. That isolation is what makes spawning a whole round in one message safe.
   - **The post-round reconciliation is sequential.** Even though no shared file is written during reconciliation, processing results one task at a time keeps the invariant that no two writes ever target the same file concurrently.

   **End state of this step:** every non-blocked task has run all its segments to completion (state file segments all `complete`, How checkboxes all checked); blocked tasks stopped at their failing segment. No worktree has been finished or removed yet, no task is at `review` status yet, `.plans/` has not been committed. That all happens in step 8.

8. **Worktree finish + post-spawn reconciliation (sequential, per task)**

   With every task's segments either complete or blocked, plan-spawn now finishes each worktree and reconciles the batch — all from the main project directory, **serialized per task** (git worktree operations mutate the shared `.git` and must not interleave).

   **a. Worktree finish — per task, serialized.** For each task, in sequence, perform plan-execute step 11e's single-repo cleanup *itself* (plan-spawn does this — there is no sub-agent involved):
   1. `cd` into that task's worktree, stage and check for uncommitted changes:
      ```bash
      cd [worktree-path] && git add -A && git status --porcelain
      ```
      If there are uncommitted changes, commit them:
      ```bash
      cd [worktree-path] && git commit -m "plan: complete work on task #NNN - [title]"
      ```
   2. Set the task file Status:
      - If the task completed all segments: set Status to `review`.
      - If the task was **blocked**: LEAVE Status at `in-progress` — a blocked task is not ready for review.
   3. Return to the project root: `cd [project-root]`.
   4. Remove the worktree: `git worktree remove .worktrees/NNN-slug`. If it fails because the worktree is dirty, force it: `git worktree remove --force .worktrees/NNN-slug`.
   5. Strip the `**Worktree:**` line from the task file. **The `**Branch:**` line STAYS.**

   **Invariant:** after `git worktree remove`, the branch and all its commits survive in the main repo's `.git`. The worktree was only a separate checkout — removing it loses nothing. `/plan-review NNN` later checks the branch out from the main project directory; the work does not need to be "brought back" from anywhere.

   **b. Compute the per-task summary values from on-disk state.** There is no sub-agent summary to parse — the wrapper-agent `BRANCH:/STATUS:/...` response format is gone. plan-spawn computes every value itself, from disk, for each task:
   - **Branch** — read the `**Branch:**` line from the task file.
   - **Status** — read the `**Status:**` line from the task file (`review` for completed tasks, `in-progress` for blocked ones).
   - **Assumptions** — count `- [high]` and `- [low]` bullets in the task file's `## Assumptions > Discovered during execution` subsection (report total plus the low/high split).
   - **Deferred** — count `⏳ Deferred to review` lines in `.plans/state/NNN-state.md`.
   - **Commits** — `git rev-list --count [default-branch]..[branch-name]` (default branch from the repo, e.g. `main`).
   - **Outcome** — derive from the above:
     - `ok` — Status is `review` AND the branch exists.
     - `blocked: [reason]` — the task hit a blocker in step 7 (Status left at `in-progress`).
     - `branch-missing` — the branch named in the task file does not exist (`git branch --list` returns nothing).
     - `status-not-review` — segments completed but Status is not `review` (worktree finish did not land it).
     - `malformed` — a `plan-executor` response could not be parsed in step 7 (see Edge Cases).
   - Do NOT auto-fix or roll back tasks based on these outcomes — record them and surface them in the summary table.

   **c. Update PROGRESS.md — once, at the end.** Move every task that landed at Status `review` into a "Ready for Review" group (create the heading if it doesn't exist); leave blocked / non-`review` tasks where they are. Update the "Last updated" date. This is a single write to a shared file, done once, after all per-task work — never mid-loop.

   **d. Commit `.plans/` changes — once, gated on `git_commits`.**
   - Check inside a git repo: `git rev-parse --git-dir 2>/dev/null`. If not, skip.
   - Check `.plans/` is not gitignored: `git check-ignore -q .plans 2>/dev/null`. If ignored, skip.
   - If `git_commits` (read once in step 2) is not `true`, skip.
   - If `git status --porcelain .plans/` shows changes:
     ```bash
     git add .plans/
     git commit -m "plan: spawn batch — N tasks (IDs: NNN, NNN, ...)"
     ```
   - If the commit fails (e.g. hooks), warn but do not fail the skill.

9. **Display summary table**

   Print a single table summarizing the spawn. **Every value in this table is computed by plan-spawn from on-disk state in step 8b — none of it is parsed from a sub-agent response.**

   ```
   Spawn complete — N tasks dispatched

   | ID  | Title                     | Branch                       | Status   | Assumptions      | Deferred | Commits | Outcome |
   |-----|---------------------------|------------------------------|----------|------------------|----------|---------|---------|
   | 001 | Fix login timeout         | fix/001-fix-login-timeout    | review   | 4 (3 low, 1 high)| 2        | 3       | ok      |
   | 003 | Add dark mode             | feature/003-add-dark-mode    | review   | 2 (0 low, 2 high)| 0        | 5       | ok      |
   | 005 | Refactor auth helpers     | refactor/005-refactor-auth   | in-progress | —             | —        | —       | blocked: [reason] |

   Next steps:
   - /plan-review NNN to walk each task's observations and diff
   - /plan-complete NNN after review approves
   ```

   - If any task outcome is non-`ok`, surface it in the Outcome column (e.g. `malformed`, `branch-missing`, `status-not-review`, `blocked: [reason]`) — do not hide failures.
   - After the summary, add the end-of-action marker as the final line:
     `🟣 SPAWNED · N tasks → Next: /plan-status`
     (substitute N with the number of tasks spawned)
   - **STOP after the marker line.** Do not auto-invoke `/plan-review`. Reviewing each task is a deliberate user step.

## Edge Cases

- **Single ID passed**: Error `Spawn requires 2+ tasks. For a single task, use \`/plan-execute NNN worktree yolo\`.`
- **No IDs passed**: Error `Spawn requires 2+ task IDs. Example: /plan-spawn 1 3 5`
- **Duplicate IDs** (`1 1 3`): Deduplicate silently — runs as `001 003`.
- **Nonexistent ID**: Abort the whole spawn before any work begins, listing the offending ID.
- **Task in `in-progress` / `review` / `in-review` / `completed`**: Abort the whole spawn before any work, listing every offender with its status. The user must resolve those (resume, review, reopen, etc.) before spawning.
- **Worktree path collision** (`.worktrees/NNN-slug` already exists): Abort with cleanup instructions (`git worktree remove --force .worktrees/NNN-slug`, then `rm -rf .worktrees/NNN-slug` if it still exists). Spawn never silently removes an existing worktree.
- **Skip-mode elaboration fails for any pending task**: Abort the whole spawn after the failure surfaces. Already-elaborated tasks from earlier loop iterations stay elaborated (those writes were idempotent and valuable on their own). Do not attempt to "un-elaborate."
- **A `plan-executor` segment spawn fails or returns malformed output**: plan-spawn detects this from the agent's response (missing/garbled `Completed / Decisions / Deviations / Blockers / Test Status` sections) combined with on-disk state (segment not actually advanced, How checkboxes not checked off). Record that task's outcome as `malformed` (or `blocked` if the response did surface a blocker), stop spawning further rounds for **that task only**, and continue every other task's rounds normally. Do NOT auto-roll-back sibling tasks — each task's branch and worktree are independent. The malformed task surfaces in the summary table.
- **All spawned `plan-executor` agents fail**: Display the summary table anyway (every row will show a non-`ok` outcome) so the user has a complete picture.
- **Step-filter language in args** (`steps 1-3`, `first 2`, etc.): Print warning `Spawn runs whole tasks; step filter ignored.` Continue with the IDs.
- **Worktree/yolo/autonomous keywords in args**: Accept silently as no-ops — spawn always implies them. No warning, no acknowledgement.
- **User cancels at confirm gate**: Exit cleanly with `Spawn cancelled. No tasks were started.` Any skip-mode elaborations from step 4 stay (they're not rolled back — elaboration on its own is harmless).
- **Not in a git repo**: Error early — spawn requires worktree support, which requires git. `Spawn requires a git repository (worktrees are mandatory).`
- **Currently inside a worktree** (`git rev-parse --show-superproject-working-tree` non-empty): Error `Run /plan-spawn from the main project directory, not a worktree.`
- **Overlapping files between spawned tasks**: Spawn does NOT detect this up-front (it would require reading each task's Impact Scope and intersecting). The confirm gate warns the user. Conflicts surface naturally at `/plan-review` / `/plan-complete` rebase time.
