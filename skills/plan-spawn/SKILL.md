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

Run two or more elaborated tasks in parallel. Each task is executed by a sub-agent inside its own isolated git worktree on its own branch, in autonomous (yolo) mode — skip-mode elaboration if needed, deferred observations, and low-confidence assumptions logged for review.

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

   For each task ID in order:
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

   For each task whose Status is `pending`:
   - Invoke the Task tool with `subagent_type: "general-purpose"` and a prompt that instructs the agent to run `/plan-elaborate NNN skip` and report success/failure. Skip mode in `/plan-elaborate` auto-accepts every prompt — see plan-elaborate's Arguments section.
   - Wait for the response. If the agent reports elaboration failed (task file Status not updated to `elaborated`, or agent returned an error), abort the whole spawn:
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
     About to spawn N tasks in parallel, each in its own worktree on its own branch:

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

6. **Fan-out (parallel — CRITICAL)**

   **In a single assistant message, invoke the Task tool once per task ID.** Multiple Task tool calls in one message run concurrently per the Agent tool contract. Do NOT use `run_in_background: true` — we want to await all results before summarizing, and single-message concurrency already provides parallelism.

   For each task ID, call the Task tool with these parameters:

   ```
   subagent_type: "general-purpose"
   isolation: "worktree"
   description: "Execute task NNN in worktree"
   prompt: <see template below>
   ```

   **Task-call prompt template** (substitute `{...}` placeholders per task):

   ```
   You are executing a single plans-cc task autonomously in an isolated git worktree.

   ## Context
   - Repository root (main checkout): {absolute-repo-path}
   - Task ID: {NNN}
   - Task title: {title}
   - Task type: {type}
   - Expected branch name: {type-map}/{NNN}-{slug}
     (type-map: bug→fix, feature→feature, refactor→refactor, chore→chore)
   - The .plans/ directory lives at {absolute-repo-path}/.plans

   ## What to do
   1. Run `/plan-execute {NNN} yolo worktree`.
      - This single command chains the autonomous worktree flow (see plan-execute step 2 parsing): yolo implies worktree + branch + skip-mode elaboration + deferred observations + low-confidence assumption logging.
      - plan-execute will create the worktree at `.worktrees/{NNN}-{slug}`, create branch `{type-map}/{NNN}-{slug}`, run the implementation, and at completion remove the worktree while leaving the branch + commits in the main repository (plan-execute step 11e).
   2. If any unexpected interactive prompt surfaces that yolo mode does not already auto-handle: pick the most plausible option, log it as a `- [low]` bullet under the task's `## Assumptions > Discovered during execution` subsection, and continue. Never block waiting for user input.
   3. Do not invoke `/plan-review` or `/plan-complete` — those are user-driven steps that happen after spawn returns.

   ## Return format
   When finished, return a structured response with EXACTLY these fields (one per line, no extra prose before the block):

   BRANCH: {branch-name-actually-created}
   STATUS: {final task Status field, expected: review}
   ASSUMPTIONS: N total (M low, P high)
   DEFERRED_OBSERVATIONS: N
   COMMITS: N
   BLOCKERS: {one-line description, or empty if none}
   NOTES: {optional free text — anything the reviewer should know}

   - ASSUMPTIONS counts bullets in the task file's `## Assumptions > Discovered during execution` subsection only (not the Initial subsection).
   - DEFERRED_OBSERVATIONS counts `⏳ Deferred to review` entries in `.plans/state/{NNN}-state.md`.
   - COMMITS counts commits on the branch (`git rev-list --count {default-branch}..{branch-name}` from the main repo).
   ```

7. **Post-spawn reconciliation (sequential)**

   After every Task call returns, for each task:
   - Parse the structured response. If it's missing fields or malformed, record `result = malformed` and capture the raw response for the summary.
   - From the main project directory (NOT a worktree path), verify on disk:
     - The branch named in `BRANCH:` exists: `git branch --list {branch-name}` returns a match.
     - The task file's Status is `review`.
     - The `.worktrees/{NNN}-{slug}/` directory has been cleaned up (plan-execute step 11e removes it). If it still exists, flag as `worktree-not-cleaned`.
   - Record an outcome per task: `ok`, `malformed`, `branch-missing`, `status-not-review`, `worktree-not-cleaned`, or `blocked` (if `BLOCKERS:` was non-empty).
   - Do NOT auto-fix or roll back successful tasks. Each task's state is what it is.

   **Update PROGRESS.md** once, at the end:
   - Each spawned `/plan-execute` already wrote itself into PROGRESS.md when it started. Now move every spawned task that landed at Status `review` from the "Active Work" / "In Progress" section into a "Ready for Review" group (create the heading if it doesn't exist).
   - Update the "Last updated" date.
   - Leave tasks with non-`review` outcomes wherever plan-execute left them.

   **Commit `.plans/` changes** if appropriate:
   - Check inside a git repo: `git rev-parse --git-dir 2>/dev/null`. If not, skip.
   - Check `.plans/` is not gitignored: `git check-ignore -q .plans/ 2>/dev/null`. If ignored, skip.
   - If `git_commits` (from step 2) is not `true`, skip.
   - If `git status --porcelain .plans/` shows changes:
     ```bash
     git add .plans/
     git commit -m "plan: spawn batch — N tasks (IDs: NNN, NNN, ...)"
     ```
   - If commit fails (e.g. hooks), warn but do not fail the skill.

8. **Display summary table**

   Print a single table summarizing the spawn:

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

   - If any task outcome is non-`ok`, surface it in the Outcome column (e.g. `malformed`, `branch-missing`, `worktree-not-cleaned`, `blocked: [reason]`) — do not hide failures.
   - **STOP after the summary.** Do not auto-invoke `/plan-review`. Reviewing each task is a deliberate user step.

## Edge Cases

- **Single ID passed**: Error `Spawn requires 2+ tasks. For a single task, use \`/plan-execute NNN worktree yolo\`.`
- **No IDs passed**: Error `Spawn requires 2+ task IDs. Example: /plan-spawn 1 3 5`
- **Duplicate IDs** (`1 1 3`): Deduplicate silently — runs as `001 003`.
- **Nonexistent ID**: Abort the whole spawn before any work begins, listing the offending ID.
- **Task in `in-progress` / `review` / `in-review` / `completed`**: Abort the whole spawn before any work, listing every offender with its status. The user must resolve those (resume, review, reopen, etc.) before spawning.
- **Worktree path collision** (`.worktrees/NNN-slug` already exists): Abort with cleanup instructions (`git worktree remove --force .worktrees/NNN-slug`, then `rm -rf .worktrees/NNN-slug` if it still exists). Spawn never silently removes an existing worktree.
- **Skip-mode elaboration fails for any pending task**: Abort the whole spawn after the failure surfaces. Already-elaborated tasks from earlier loop iterations stay elaborated (those writes were idempotent and valuable on their own). Do not attempt to "un-elaborate."
- **Spawned agent fails or returns malformed summary**: Record it in the summary table with the appropriate outcome (`malformed`, `branch-missing`, `status-not-review`, `worktree-not-cleaned`, `blocked: ...`). Do NOT auto-rollback successful sibling tasks — they're independent.
- **All spawned agents fail**: Display the summary table anyway (every row will show a non-`ok` outcome) so the user has a complete picture.
- **Step-filter language in args** (`steps 1-3`, `first 2`, etc.): Print warning `Spawn runs whole tasks; step filter ignored.` Continue with the IDs.
- **Worktree/yolo/autonomous keywords in args**: Accept silently as no-ops — spawn always implies them. No warning, no acknowledgement.
- **User cancels at confirm gate**: Exit cleanly with `Spawn cancelled. No tasks were started.` Any skip-mode elaborations from step 4 stay (they're not rolled back — elaboration on its own is harmless).
- **Not in a git repo**: Error early — spawn requires worktree support, which requires git. `Spawn requires a git repository (worktrees are mandatory).`
- **Currently inside a worktree** (`git rev-parse --show-superproject-working-tree` non-empty): Error `Run /plan-spawn from the main project directory, not a worktree.`
- **Overlapping files between spawned tasks**: Spawn does NOT detect this up-front (it would require reading each task's Impact Scope and intersecting). The confirm gate warns the user. Conflicts surface naturally at `/plan-review` / `/plan-complete` rebase time.
