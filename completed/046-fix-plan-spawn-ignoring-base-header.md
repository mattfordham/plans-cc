# Fix plan-spawn ignoring the Base header

**ID:** 046
**Created:** 2026-10-05T16:32
**Type:** bug
**Status:** completed
**Completed:** 2026-10-05T21:16
**Branch:** fix/046-fix-plan-spawn-ignoring-base-header

## What
`skills/plan-spawn/SKILL.md` step 6b runs `git worktree add .worktrees/NNN-slug -b [branch-name]` with no start point, so a spawned task branches from the current HEAD instead of its target branch. It should resolve the target per the **Resolve target branch** contract in CLAUDE.md (the task's `**Base:**`, else the default branch), apply the create-if-missing rule, and pass `[target]`. Add plan-spawn to that contract's consuming-sites list, and apply #042's plans-branch guard (`plans-git.js is-plans-branch`, branch mode only) there too.

## Why
plan-spawn silently ignores a task's `**Base:**` header: every spawned worktree branches from whatever HEAD happens to be checked out, so a task that should branch from `feature/x` lands on an unrelated commit, and review/complete then diff and merge against the wrong base. plan-spawn is also missing #042's plans-branch guard, so in branch mode a `**Base:**` that resolves to the orphan plans branch would corrupt the code checkout instead of hard-stopping. Both are gaps the **Resolve target branch** contract already closes everywhere else — plan-spawn is the one git-lifecycle skill the audit missed.

## How Summary
Mirror plan-execute's step-7c/7e target-branch handling inside plan-spawn's per-task setup loop: resolve `target` from each task's `**Base:**` header (else the default branch), run the branch-mode plans-branch guard, apply the create-if-missing rule, and append `[target]` to the worktree command. Because plan-spawn is always single-repo worktree mode and runs per task in sequence, resolution/guard/create-if-missing all live inside the existing per-task loop and reuse plan-execute's exact wording. Finally, register plan-spawn in the contract's consuming-sites list in CLAUDE.md so the audit list stays complete.

**Files of note:**
- `skills/plan-spawn/SKILL.md` — step 6 (per-task setup): step 6a/6b gain target resolution + guard + create-if-missing, and line 161's worktree command gains `[target]`
- `skills/plan-execute/SKILL.md` — the canonical pattern to mirror: step 7c (lines 417-420, resolution + create-if-missing + plans-branch guard) and step 7e (line 460, `git worktree add … -b [branch-name] [target]`)
- `CLAUDE.md` — the **Resolve target branch** contract; add a `plan-spawn` bullet to the consuming-sites list (lines 412-416) and name plan-spawn in the Never-the-plans-branch bullet (line 421)

## Diagnosis

**Most likely:** plan-spawn step 6 never resolves a target branch and its worktree command omits the start-point argument, so git branches every spawned worktree from the current HEAD rather than from the task's `**Base:**`/default target (`skills/plan-spawn/SKILL.md:161`).
**Evidence:** Line 161 reads `git worktree add .worktrees/NNN-slug -b [branch-name]` with no trailing `[target]`, whereas the pattern it claims to "follow exactly" (plan-execute step 7e, `skills/plan-execute/SKILL.md:460`) reads `git worktree add .worktrees/NNN-slug -b [branch-name] [target]`. A grep of `skills/plan-spawn/SKILL.md` finds zero occurrences of `Base:` — step 6 never reads the header, so no `target` is ever resolved. Step 6a says "follow plan-execute step 7c exactly" but does not reproduce 7c's resolution (417), create-if-missing rule (418), or plans-branch guard (420).
**Confidence:** high

**Alternative:** The symptom could instead stem from a missing create-if-missing step — a valid but not-yet-local `**Base:**` would fail `git worktree add` (`skills/plan-spawn/SKILL.md:157-162`) — **Confidence:** low. This is a real secondary gap, not the primary wrong-branch symptom; it is folded into the same fix rather than being a competing root cause.

**To confirm:** Grep `skills/plan-spawn/SKILL.md` for `Base:` and inspect line 161 — confirm (a) the header is never read anywhere in the skill and (b) the worktree command has no trailing start-point argument. Both are agent-verifiable by reading the file; no runtime observation is needed.

## How
- [x] Step 1: Confirm the diagnosis — grep `skills/plan-spawn/SKILL.md` for `Base:` (expect zero hits) and read step 6b line 161 to confirm the `git worktree add … -b [branch-name]` command has no trailing `[target]`. This nails both the resolution gap and the missing start point before any edit. (Agent-verifiable, so untagged.)
- [x] Step 2: Re-read the canonical pattern in `skills/plan-execute/SKILL.md` — step 7c lines 417-420 (target resolution, create-if-missing rule, plans-branch guard) and step 7e line 460 (`git worktree add .worktrees/NNN-slug -b [branch-name] [target]`) — so plan-spawn mirrors the exact wording rather than paraphrasing it.
- [x] Step 3: In `skills/plan-spawn/SKILL.md` step 6, add a "Resolve the target branch" sub-step at the top of the per-task loop (before step 6a's branch creation): read the task's `**Base:**` header and set `target` per the **Resolve target branch** contract (the `**Base:**` value when present and non-empty, else the repo default via `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'` → `main` → `master`). Resolve per task, inside the loop, because each spawned task carries its own `**Base:**`.
- [x] Step 4: Add the plans-branch guard (branch mode only) to the same sub-step, mirroring plan-execute step 7c line 420: only when `**Base:**` is present and non-empty, if `node ~/.claude/plans-cc/plans-git.js mode` prints `branch` AND `node ~/.claude/plans-cc/plans-git.js is-plans-branch <target>` prints `yes`, abort this task — create no branch/worktree, leave its status unchanged, record it in the spawn summary, and surface `🔴 BLOCKED · Task #NNN — **Base:** is the plans branch`. In any other mode, or when the helper is missing, skip the guard.
- [x] Step 5: Add the create-if-missing rule to the same sub-step, mirroring plan-execute step 7c line 418: if `target` does not exist locally, create it from the repo default (`git branch <target> <default-branch>`), print the one-line notice `Base branch <target> not found — created locally from <default-branch> (not pushed).`, and never push it.
- [x] Step 6: Edit step 6b line 161 so the worktree command becomes `git worktree add .worktrees/NNN-slug -b [branch-name] [target]`, and add a sentence noting `target` is resolved in the new sub-step and that when `**Base:**` is absent this is byte-for-byte unchanged from branching the default branch.
- [x] Step 7: In `CLAUDE.md`, add a `plan-spawn` bullet to the **Resolve target branch** contract's "Consuming sites (auditable list)" (after the `plan-complete` bullet, before `plan-pause`/`plan-backlog`), e.g. "**`plan-spawn`** — branches each spawned worktree FROM the target (single-repo, worktree mode, per task); create-if-missing and the plans-branch guard apply per task.", and add `plan-spawn` alongside `plan-execute`/`plan-complete` in the "Never the plans branch" bullet (line 421).
- [x] Step 8: Re-read the edited plan-spawn step 6 and the CLAUDE.md contract end-to-end to confirm consistency: the worktree command carries `[target]`, the guard/create-if-missing wording matches plan-execute, and the contract's auditable list now names plan-spawn.

## Verification
- `skills/plan-spawn/SKILL.md` step 6b's worktree command is `git worktree add .worktrees/NNN-slug -b [branch-name] [target]` (start-point present), and a new resolve-target sub-step reads `**Base:**` and sets `target` per the contract.
- The plans-branch guard (branch mode only, via `plans-git.js mode` + `is-plans-branch`) and the create-if-missing rule both appear in plan-spawn step 6, worded to match plan-execute step 7c (lines 418, 420).
- `grep -n "Base:" skills/plan-spawn/SKILL.md` now returns matches (the header is read); `grep -n "is-plans-branch" skills/plan-spawn/SKILL.md` returns a match (the guard is present).
- `CLAUDE.md`'s **Resolve target branch** consuming-sites list contains a `plan-spawn` bullet, and the "Never the plans branch" bullet names plan-spawn.
- When a task has no `**Base:**` and the default branch is the resolve result, the emitted command is equivalent to today's for a default-branch start point (no behavior change beyond branching from the resolved default rather than an arbitrary HEAD).
- `npm test` still passes (no runtime code changed — skills are declarative — so this is a regression guard only).

## Impact Scope

### Files to Modify
- [ ] `skills/plan-spawn/SKILL.md` — add resolve-target + plans-branch guard + create-if-missing to step 6; append `[target]` to the step 6b worktree command (line 161)
- [ ] `CLAUDE.md` — add a `plan-spawn` bullet to the **Resolve target branch** consuming-sites list (lines 412-416); name plan-spawn in the "Never the plans branch" bullet (line 421)

### Related Files (may need updates)
- `skills/plan-execute/SKILL.md` — reference only (the pattern being mirrored); not modified
- `.plans/completed/042-add-branch-mode-cleanup-health-check.md` — context for the guard's origin; not modified

### Endpoints/UI Affected
- None — plans-cc has no UI/endpoints; the change is to declarative skill instructions only.

## Assumptions

### Initial (from elaboration)
- [low] Resolve the target, run the plans-branch guard, and apply create-if-missing **per task inside step 6's existing sequential loop** (not as a batch preflight in step 3). **Why:** step 6a already says "follow plan-execute step 7c exactly" and plan-spawn processes tasks one at a time, so per-task resolution mirrors the canonical pattern most faithfully; the research flagged preflight-vs-step-6 placement as an open question.
- [low] When the plans-branch guard fires for a task, **abort only that task and surface it in the spawn summary**, leaving other tasks to proceed — rather than aborting the whole spawn. **Why:** matches plan-spawn step 7's existing per-task `blocked` handling and its fan-out philosophy (one bad `**Base:**` shouldn't cancel unrelated parallel work); the research left guard-failure granularity open.
- [high] Mirror plan-execute's **single-repo** worktree path only, not the multi-repo per-repo resolution. **Why:** plan-spawn step 6b already delegates to "plan-execute step 7e's single-repo command sequence" — plan-spawn has no multi-repo mode, so per-repo base resolution is out of scope.
- [high] Use plan-execute step 7c/7e wording verbatim for the guard, create-if-missing, and the `[target]` command. **Why:** the **Resolve target branch** and plans-branch-guard contracts are cross-skill and prescribe exact wording; divergent phrasing would create drift between sites the audit list treats as equivalent.
- [low] The elaboration ran fully autonomously (no interactive prompts available); all Path/section decisions above were auto-selected on the user's behalf. **Why:** invoked in a non-interactive session with an explicit instruction to make reasonable choices and record them here.

### Discovered during execution
- [high] Placed the new resolve-target + plans-branch-guard sub-step as `a0` at the top of step 6's per-task loop, before existing sub-step `a`, rather than renumbering `a`–`e`. **Why:** inserting before `a` keeps every downstream reference to steps 6a–6e intact (including this segment's later steps 5 and 6 which touch 6a's branch creation and 6b's worktree command), avoiding a cascade of renumber edits and reducing drift risk.
- [high] Corrected the guard's summary-location reference from "step 7" (the segment prompt's wording) to "the final summary table (step 9)". **Why:** plan-spawn's actual summary table is step 9; step 7 is the interleaved segment-execution loop. Pointing the blocked-task record at the real summary site keeps the instruction executable.
- [low] Mirrored plan-execute step 7c's default-branch resolution idiom inline (`git symbolic-ref … → main → master`) in the a0 sub-step rather than only citing the contract. **Why:** plan-spawn does all branch setup itself in the main conversation and had no prior resolution logic, so spelling out the idiom (as plan-execute step 7c does) makes the sub-step self-contained; the "Resolve target branch" contract is still cited by name.
- [high] Placed the create-if-missing rule as a bullet AFTER the plans-branch guard in the `a0` sub-step, and amended the guard's "Run this before…" clause to read "before any branch creation, create-if-missing, or worktree creation." **Why:** plan-execute step 7c orders the create-if-missing rule first but has its guard explicitly state it runs "before any checkout, branch creation, or create-if-missing" — ordering by text, not by position. Appending create-if-missing to the end of the existing a0 bullet list (guard already present from segment 1) while making the guard's precedence explicit preserves plan-execute's actual run-order semantics with minimal churn.
- [low] Shortened the create-if-missing notice to `Base branch <target> not found — created locally from <default-branch> (not pushed).` (dropping plan-execute 7c's ` in <repo>` qualifier). **Why:** plan-spawn is single-repo only (spawn always implies single-repo worktree mode), so there is no repo name to disambiguate; the segment prompt specified this exact single-repo wording.

## Changes

Fixed in a worktree on branch `fix/046-fix-plan-spawn-ignoring-base-header` (branched from `main`). All changes are to declarative skill markdown + CLAUDE.md — no runtime code touched.

**`skills/plan-spawn/SKILL.md`** (step 6, per-task setup loop):
- Added a new `**a0. Resolve the target branch**` sub-step at the top of the per-task loop (before branch creation), mirroring plan-execute step 7c verbatim:
  - Reads each task's `**Base:**` header and sets `target` per the **Resolve target branch** contract (`**Base:**` value if present & non-empty, else repo default via `git symbolic-ref … → main → master`). Resolved per task, inside the loop, since each spawned task carries its own `**Base:**`.
  - **Plans-branch guard** (branch mode only, when `**Base:**` is present & non-empty): if `plans-git.js mode` prints `branch` AND `plans-git.js is-plans-branch <target>` prints `yes`, aborts THAT task — no branch/worktree created, status unchanged, recorded in the step-9 summary table with `🔴 BLOCKED · Task #NNN — **Base:** is the plans branch`; continues to the next task. Skipped in any other mode or when the helper is missing.
  - **Create-if-missing rule**: if `target` doesn't exist locally, creates it from the repo default (`git branch <target> <default-branch>`), prints `Base branch <target> not found — created locally from <default-branch> (not pushed).`, never pushes. No-op when `**Base:**` is absent.
- Edited the step 6b worktree command from `git worktree add .worktrees/NNN-slug -b [branch-name]` → `git worktree add .worktrees/NNN-slug -b [branch-name] [target]`, with a note that `target` is resolved in `a0` and that when `**Base:**` is absent the command is byte-for-byte unchanged from branching the default branch.

**`CLAUDE.md`** (the **Resolve target branch** contract):
- Added a `**plan-spawn**` bullet to the "Consuming sites (auditable list)" (after `plan-complete`, before `plan-pause`/`plan-backlog`): "branches each spawned worktree FROM the target (single-repo, worktree mode, per task); create-if-missing and the plans-branch guard apply per task."
- Added `plan-spawn` alongside `plan-execute`/`plan-complete` in the "Never the plans branch" bullet.

**Verification results (all passing):**
- `grep -n "Base:" skills/plan-spawn/SKILL.md` → matches (header now read).
- `grep -n "is-plans-branch" skills/plan-spawn/SKILL.md` → match (guard present).
- `grep -n "\[branch-name\] \[target\]" skills/plan-spawn/SKILL.md` → match (start point present).
- `grep -n "plan-spawn" CLAUDE.md` → new consuming-sites bullet + Never-the-plans-branch mention present.
- `node --test` regression guard: 87 passed, 0 failed (no runtime code changed).
- Diff scope confirmed: only `CLAUDE.md` and `skills/plan-spawn/SKILL.md` modified.

**Deviations:**
- Guard's blocked-task record points at plan-spawn's actual final summary table (step 9), not the prompt's "step 7" (which is the segment-execution loop) — accuracy correction, behavior unchanged.
- Added `create-if-missing` to the guard's "run before …" precedence clause so plan-execute's guard-before-create ordering is explicit in text (plan-execute 7c lists create-if-missing first positionally but states the guard runs before it).

## Notes
- Follow-up found during #042 execution (see the Changes section of `042-add-branch-mode-cleanup-health-check.md`).
