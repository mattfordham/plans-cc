# Add /plan-spawn skill to run multiple tasks in parallel

**ID:** 009
**Created:** 2026-05-13T12:00
**Type:** feature
**Status:** completed
**Branch:** feature/009-add-plan-spawn-skill-to-run-multiple-tasks
**Completed:** 2026-05-13T20:32

## What
Add /plan-spawn skill to run multiple tasks in parallel, each isolated in its own git worktree via the Agent tool's isolation:"worktree" mode. Always runs in yolo/autonomous semantics: skip-mode elaborates any pending tasks first, fans out N Agent calls in a single message, each agent runs /plan-execute NNN yolo worktree semantics in its isolated worktree, then post-spawn each task ends in 'review' status with low-confidence assumptions and deferred observations logged for /plan-review. Refuse <2 task IDs (suggest /plan-execute instead). Abort on in-progress/review/completed tasks or worktree path collisions. Print a summary table (id, title, branch, assumptions, deferred obs, status) at the end. New file: skills/plan-spawn/SKILL.md. Reference conventions from plan-execute (worktree dir .worktrees/NNN-slug, branch <type>/NNN-<slug>, assumption logging, deferred observations). Also update CLAUDE.md "All Skills" table. Full design notes in ~/.claude/plans/happy-plotting-bubble.md.

## Why
Adds value by enabling concurrent execution of independent tasks. The current `/plan-execute` runs tasks sequentially even when given multiple IDs, blocking the user on long-running work. With worktree isolation, several yolo-mode tasks can progress in parallel and converge to `review` status for batched human review — substantially reducing wall-clock time on backlog burn-down.

## How
- [x] Step 1: Create `skills/plan-spawn/` directory and write `SKILL.md` with frontmatter (`name: plan-spawn`, `disable-model-invocation: true`, `argument-hint: "<id> <id> [<id>...]"`, `allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, Task]`, `description: "Run multiple tasks in parallel, each in its own worktree (always autonomous/yolo)"`).
- [x] Step 2: Write the SKILL.md body with these sections: Argument parsing (require ≥2 numeric IDs, dedupe, zero-pad; silently accept `yolo`/`worktree` for muscle-memory parity; warn on step-filter keywords); Preflight (verify each task exists in `.plans/pending/`, abort if any task is `in-progress`/`review`/`completed`, abort on `.worktrees/NNN-slug` collisions, read `.plans/config.json` once); Skip-mode pre-elaboration (for any task with status `pending`, invoke `/plan-elaborate NNN skip` via the Task tool, abort whole spawn on failure); Confirm gate (single `AskUserQuestion` showing IDs + titles + planned branch names); Fan-out (single message with N Task calls, `isolation: "worktree"`, each prompt instructs the agent to run `/plan-execute NNN yolo worktree` and report a structured summary); Post-spawn verification (verify branch exists in main repo, task file status is `review`, worktree dir is cleaned up); PROGRESS.md update; final summary table.
- [x] Step 3: In the SKILL.md, document the Task-call prompt template so each spawned agent gets: absolute repo path, task ID + title, expected branch name (`<type>/NNN-<slug>` per plan-execute step 7c), instruction to run plan-execute with `yolo worktree` keywords (which chains skip-mode elaboration, deferred observations, low-confidence assumption logging, and ends in `review` status per plan-execute step 11e), and a structured return format (branch, commits, assumptions count, deferred-obs count, blockers).
- [x] Step 4: Document edge cases in SKILL.md: single ID → refuse with hint, duplicate IDs → dedupe silently, non-existent ID → abort, in-progress/review/completed task → abort, worktree path collision → abort with cleanup instruction, skip-mode elaboration failure → abort whole spawn, partial agent failure → surface in summary table without rollback, overlapping-files warning at confirm gate (worktrees isolate working trees but reviews may conflict).
- [x] Step 5: Update `CLAUDE.md` "All Skills" table (around line ~214) to add a row: `` | `/plan-spawn` | Fan out N tasks in parallel, each in its own worktree (always autonomous) | ``. No lifecycle diagram update needed — spawned tasks follow the existing worktree→review path.
- [ ] Step 6: Manual smoke test in a scratch repo per the Verification section. Run `node bin/dev.js` to symlink the new skill, then walk through the full lifecycle: capture two tasks → `/plan-spawn 1 2` → confirm gate → two parallel agents → verify both branches exist, both task files at `review`, both worktrees cleaned up, summary table prints correctly. Then run edge-case checks: single ID refused, nonexistent ID aborted, in-progress task aborted.

## Verification
Manual smoke test (no automated test framework in this project):
1. `node bin/dev.js` to symlink the new skill into `~/.claude/skills/plan-spawn/`.
2. In a scratch repo: `/plan-init`, then `/plan-capture Task A` and `/plan-capture Task B` (leave both un-elaborated).
3. Run `/plan-spawn 1 2`. Expect: skip-mode elaboration runs for both, confirm gate shows both tasks with branch names, two Task calls fire in one message, both `.worktrees/NNN-slug` directories created during execution, both branches `feature/001-task-a` and `feature/002-task-b` created in main repo, both task files end at `**Status:** review`, worktrees are removed (per plan-execute step 11e), summary table prints, and `/plan-review 1` / `/plan-review 2` work normally afterward.
4. Edge cases: `/plan-spawn 1` → refused with "use /plan-execute instead"; `/plan-spawn 99` → aborts cleanly; `/plan-spawn` on a task already `in-progress` → aborts before fan-out.

## Impact Scope

### Files to Modify
- [ ] `skills/plan-spawn/SKILL.md` — NEW. The entire skill definition (frontmatter + body).
- [ ] `CLAUDE.md` — Add `/plan-spawn` row to the "All Skills" table.

### Related Files (may need updates)
- `README.md` — May list commands; if so, add `/plan-spawn`. Check during implementation.
- `skills/plan-help/SKILL.md` — May enumerate commands; verify and add a line if appropriate.

### Endpoints/UI Affected
- New slash command `/plan-spawn <id> <id> [<id>...]` available after `node bin/dev.js` or `npx plans-cc` install.

## Assumptions

### Initial (from elaboration)
- [high] Skip-mode pre-elaboration is invoked via `/plan-elaborate NNN skip` per the Task tool. **Why:** plan-elaborate's SKILL.md explicitly documents `skip` / `auto` / `noprompt` keywords that auto-accept all prompts; plan-execute's step 3 already uses this pattern.
- [high] Each spawned agent runs `/plan-execute NNN yolo worktree` inside its isolated worktree. **Why:** plan-execute step 2 documents that `yolo` implies `worktree`+`branch`+skip-mode elaboration+deferred observations+low-confidence assumption logging — exactly the semantics we need for parallel autonomous runs.
- [high] Branch naming `<type>/NNN-<slug>` and worktree path `.worktrees/NNN-slug`. **Why:** Both are the documented conventions in plan-execute steps 7c/7e; reusing them keeps `/plan-review` and `/plan-complete` working unchanged.
- [high] Each task ends in `review` status, not `completed`. **Why:** plan-execute step 11e sets status to `review` after worktree cleanup; this is the canonical handoff point to `/plan-review`.
- [low] The orchestrator awaits all Task calls before printing the summary (no `run_in_background: true`). **Why:** Issuing N Task calls in a single message already runs them concurrently per the Agent tool contract; background mode adds notification complexity without parallelism gain. Could revisit if users want fire-and-forget.
- [low] Refuse spawn with fewer than 2 IDs rather than transparently delegating to `/plan-execute`. **Why:** Clearer mental model — `/plan-spawn` means parallel-many; single-task path stays with `/plan-execute`. Could relax later if users hit it often.
- [low] Skip-mode elaboration failure aborts the whole spawn rather than excluding the failed task and proceeding with the rest. **Why:** A half-elaborated batch is harder to reason about than a clean abort; user can retry after fixing the offending task.
- [low] Overlapping-file conflicts between parallel tasks are surfaced as a warning at the confirm gate, not auto-detected up-front. **Why:** True overlap detection requires running each task's planning phase, which is exactly what the spawn does. A warning + post-spawn review is sufficient for v1.

### Discovered during execution
- [high] Mirrored plan-execute's branch-type mapping (bug→fix, feature→feature, refactor→refactor, chore→chore) verbatim in the spawn confirm gate and Task-call prompt. **Why:** Reusing the exact mapping from plan-execute step 7c keeps branch names consistent across single-task and parallel-spawn flows, so downstream `/plan-review` and `/plan-complete` work unchanged.
- [high] Added a `## Edge Cases` guard rejecting spawn when run from inside an existing worktree. **Why:** plan-execute step 7e already errors when invoked inside a worktree (worktree-of-worktree is unsupported by git); enforcing the same guard at the spawn entry point fails fast instead of letting each sub-agent fail individually.
- [low] Post-spawn PROGRESS.md reconciliation groups `review`-status tasks under a "Ready for Review" heading (created if absent) rather than leaving them in "Active Work". **Why:** plan-execute writes tasks into "Active Work" when it starts; spawn explicitly moves them at end-of-batch so the user has a single list of what's ready to review. A future PROGRESS.md schema change could obviate this.
- [low] Spawn does not roll back skip-mode elaborations when the user cancels at the confirm gate. **Why:** Elaboration on its own is harmless and often valuable independently; rolling it back would require restoring `pending` status, decrementing PROGRESS.md counters, and reverting commit — too much side-effect surface for what's essentially a "maybe I'll come back to this" cancel.
- [low] Single commit `plan: spawn batch — N tasks (IDs: ...)` after post-spawn PROGRESS.md update, rather than per-task commits. **Why:** Each spawned `/plan-execute` already commits its own task file mutations on its branch; the spawn-level commit only covers PROGRESS.md reconciliation, which is one logical operation. Could split per-task if the batch commit message becomes too noisy.
- [low] The Task-tool prompt instructs sub-agents to log any unexpected interactive prompt as a `- [low]` assumption rather than blocking. **Why:** plan-execute yolo mode already handles observations and the documented prompt set, but parallel execution can't tolerate any blocker — defaulting to "pick + log" preserves throughput. A future iteration could distinguish "safe to guess" vs "must escalate" prompts.
- [high] Placed the `/plan-spawn` row immediately after `/plan-guide` (the current last entry) in CLAUDE.md's "All Skills" table, matching the step instruction verbatim. **Why:** Keeps the table append-only and chronological by skill-introduction order, which matches the existing pattern.
- [high] Added a `/plan-spawn <ids...>` entry to README.md's "Git Integration" command table (rather than "Core Workflow" or a new section). **Why:** spawn is fundamentally a parallel-worktree orchestrator; the Git Integration table is where `/plan-review` and the `branch`/`use worktree` keyword variants live, so it's the most semantically adjacent home.
- [high] Bumped README.md's "This copies 27 skill files" line to 28 to match the CLAUDE.md count. **Why:** Both numbers describe the same fact (installed skill count) and would be confusing if they disagreed.
- [low] Added the `/plan-spawn` row to plan-help/SKILL.md's "All Commands" table directly after `/plan-guide`, mirroring the CLAUDE.md placement. **Why:** Consistency between the in-editor help and the project's own skill-table ordering; users will likely scan both side-by-side.
- [low] Did NOT touch README.md's stale "(21 total)" comment on line 304 in the Development > Project Structure block. **Why:** Out of scope for this step; the instruction only called out the CLAUDE.md count. Worth a follow-up task to reconcile.

## Changes
- Created `skills/plan-spawn/SKILL.md` (236 lines) with frontmatter, Arguments, Steps (preflight, parse, skip-mode elaborate, confirm gate, fan-out with Task-call prompt template, post-spawn reconciliation, summary table), and Edge Cases section.
- Updated `CLAUDE.md` "All Skills" table with `/plan-spawn` row; bumped skill count comment 27 → 28.
- Updated `README.md` with `/plan-spawn` entry (Git Integration table) and "skill files" count.
- Updated `skills/plan-help/SKILL.md` "All Commands" table with `/plan-spawn` row.
- Step 6 (manual smoke test) deferred to /plan-review — requires human-in-the-loop execution in a scratch repo.
- Sub-agents appended 11 total assumption bullets to Discovered-during-execution (5 `[high]`, 6 `[low]`).

## Notes
Full design notes from plan mode at ~/.claude/plans/happy-plotting-bubble.md
