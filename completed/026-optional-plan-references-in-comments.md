# Optional "Plan references in comments" setting at init

**ID:** 026
**Created:** 2026-07-16T11:56
**Type:** feature
**Status:** completed
**Branch:** feature/026-plan-references-in-comments
**Completed:** 2026-07-16T14:21

## What
When initializing, an option should be presented to user to enable "Plan references in comments". If enabled, things work as they do now. If NOT enabled, the executors should never write code comments referring back to the plan number or steps. This is to avoid confusion for projects where the plan files are not kept in repo.

## Why
Adds value by letting projects that gitignore `.plans/` keep their codebase free of code comments like `// Task #012 Step 3` — such references are meaningless (and confusing) to anyone reading the repo without the plan files. Today this behavior is *emergent*, not instructed: no skill or agent mandates plan-reference comments, but executor prompts front-load `**ID:** #NNN` and step lines, and executors naturally echo them into code. The fix is a per-project opt-out flag that injects an explicit negative instruction into every code-writing prompt path.

## How Summary
Add a `plan_comments` boolean to `.plans/config.json`, asked once at `/plan-init` via a new AskUserQuestion (recommendation tied to the gitignore choice). Because the no-comments behavior must be prompt-driven (the plan-executor agent file is global, config is per-project), the flag gates a conditional `## Code Comment Policy` block injected into every executor/build prompt path: plan-execute's segment template plus its observation-fix, issue-fix, feedback-fix, and des-build-route prompts; plan-spawn's per-task prompts; and plan-review's fix spawn. Missing key defaults to `true` (current behavior) — only explicit `false` suppresses plan references.

**Files of note:**
- `skills/plan-init/SKILL.md` — new config key in the step-6 template + new AskUserQuestion for the setting
- `skills/plan-execute/SKILL.md` — flag read + conditional Code Comment Policy block in the segment template (step 11c) and the observation-fix, issue-fix, feedback-fix, and des-build-route prompts
- `skills/plan-spawn/SKILL.md` — flag added to the one-time up-front config read; conditional block named in the per-task prompt field list
- `skills/plan-review/SKILL.md` — comment policy included in the review fix-spawn prompt
- `agents/plan-executor.md` — neutral standing rule: only write plan-referencing comments when the prompt permits them
- `CLAUDE.md`, `README.md` — document the new config key

## How
- [x] Step 1: Add `"plan_comments": true` to the config.json template in `skills/plan-init/SKILL.md` step 6, and add a new AskUserQuestion step (after the git-tracking question, step 7) asking whether executors may write plan-referencing code comments — 2 options, with "No plan references" recommended when `.plans/` was just gitignored and "Allow plan references" recommended otherwise; write the answer into config.json
- [x] Step 2: In `skills/plan-execute/SKILL.md`, read `plan_comments` from config alongside the existing config reads, and add a conditional block to the step-11c segment prompt template (modeled on the `[If worktree_mode]:` line): `[If plan_comments is false]: ## Code Comment Policy — NEVER write code comments referencing the plan, task number, task title, or step numbers…`
- [x] Step 3: Propagate the same conditional policy to plan-execute's other code-writing prompt paths: the observation-fix spawn, the issue-fix prompt (step 13), the testing-feedback fix prompt (step 14c), and the des-build route invocation (mirroring the existing "Autonomous deferral — the invocation prompt MUST instruct…" pattern at step 11)
- [x] Step 4: In `skills/plan-spawn/SKILL.md`, extend the one-time up-front config read (step 2) to capture `plan_comments` (never re-read mid-loop, per the concurrency rule), and name the new conditional section in step 7b.3's enumerated prompt field list; in `skills/plan-review/SKILL.md`, include the policy in the fix-spawn prompt when the flag is false
- [x] Step 5: Add a neutral standing rule to `agents/plan-executor.md`: never write plan/task/step-referencing code comments unless the spawning prompt explicitly states the project allows them (project-neutral wording, since the agent file is global while the setting is per-project)
- [x] Step 6: Update docs — the config.json key list in `CLAUDE.md` and `README.md`, plus README's init walkthrough if it shows the config template or init questions
- [x] Step 7: Manual verification — `node bin/dev.js`, run `/plan-init` in a scratch project and confirm the new question and config key; flip the flag to `false` and confirm a `/plan-execute` prompt includes the Code Comment Policy block *(agent prerequisites done — dev install clean, consistency greps pass; scratch-project /plan-init walkthrough skipped by user)*

## Verification
- `/plan-init` in a fresh directory asks the new question and writes `plan_comments` into `.plans/config.json`
- With `plan_comments: false`, the plan-executor segment prompt (and issue-fix / feedback-fix / spawn / review-fix / des-build prompts) contains the Code Comment Policy block; produced code contains no `Task #NNN` / step-number comments
- With `plan_comments: true` **or the key missing** (pre-existing projects), behavior is byte-identical to today — no policy block is injected
- Grep `skills/` to confirm every executor spawn path carries the conditional block

## Impact Scope

### Files to Modify
- [x] `skills/plan-init/SKILL.md` — config template key + new AskUserQuestion
- [x] `skills/plan-execute/SKILL.md` — flag read + conditional block in 5 prompt paths (segment template, observation-fix, issue-fix, feedback-fix, des-build route)
- [x] `skills/plan-spawn/SKILL.md` — up-front flag read + prompt field list
- [x] `skills/plan-review/SKILL.md` — fix-spawn prompt policy
- [x] `agents/plan-executor.md` — neutral standing rule
- [x] `CLAUDE.md` — config key documentation
- [x] `README.md` — config key documentation / init walkthrough

### Related Files (may need updates)
- `bin/install.js` / `bin/dev.js` — no change expected (already copy/symlink `agents/*.md`), verify only
- `skills/des-build/SKILL.md` — no change expected; policy flows via invocation prompt

### Endpoints/UI Affected
- `/plan-init` — one additional question during initialization
- Executor prompts — conditional policy block when flag is `false`

## Assumptions

### Initial (from elaboration)
- [low] Key named `plan_comments` (boolean, positive polarity) with gate phrased "if `plan_comments` is `false`" so a **missing key means allowed** (current behavior for pre-existing projects). **Why:** research flagged that blindly copying the `git_commits` "not true ⇒ off" polarity would silently change behavior for every existing project; explicit-false gating is the only backwards-compatible option. Alternative names (`plan_references_in_comments`, negative `no_plan_comments`) were considered and dropped for brevity/cleanliness.
- [low] The init question's recommended option is tied to the git-tracking answer (gitignored `.plans` ⇒ recommend "No plan references"; checked-in ⇒ recommend "Allow"). **Why:** the motivating scenario is exactly "plan files not kept in repo"; contextual recommendation was the first of two plausible options (the other: always recommend one fixed option).
- [low] `agents/plan-executor.md` gets a neutral standing rule ("only write plan-referencing comments when the prompt permits") in addition to prompt injection. **Why:** belt-and-braces against the emergent behavior; but the agent file is global so the rule must stay project-neutral — kept as a separate step so it can be dropped if deemed redundant.
- [high] The policy is purely additive prompt text — nothing to delete, since no skill currently mandates plan-reference comments (research grepped exhaustively; behavior is emergent). When the flag is `true`/missing, zero prompt changes occur.
- [high] Scope stays at this one setting — `/plan-init` does NOT also start asking about `git_commits`, and no skill offers to backfill the key into old configs (missing-key default covers them). **Why:** matches the task description's scope; backfill adds complexity for no behavior change.

### Discovered during execution
- [low] The plan-init question (new step 8) fires unconditionally, even when step 7 (git tracking) was skipped because the project is not a git repo or `.plans` was already gitignored — those cases are folded into the "No plan references" recommendation text rather than skipping the question. **Why:** the task said the recommendation depends on the git-tracking answer *or* the already-gitignored/not-a-repo cases, implying the question is always asked; skipping it would leave the flag implicitly `true` with no user say.
- [low] Step 14c's fix prompt repeats the full template (rather than saying "same as step 13"), so I added the full conditional `## Code Comment Policy` block there too instead of a note. **Why:** the task allowed either; duplicating keeps the two inline templates textually parallel, matching how they already duplicate every other section.
- [low] Placed the conditional `## Code Comment Policy` section immediately after `## Project Context` in the 11c segment template (and in the step-13/14c fix templates), using the `[If plan_comments_off, include this section:]` notation modeled on `## Observation Steps`. **Why:** task suggested "right after the Project Context block or near the top"; after Project Context keeps policy context adjacent to project context in all three templates.
- [high] plan-init confirmation (now step 9) gained a one-line "Plan references in code comments: allowed/disabled" entry, mirroring the existing gitignore/tracking line. **Why:** the display already lists the git-tracking choice in exactly this either/or shape — single plausible pattern-match.
- [low] The standing rule in `agents/plan-executor.md` was added as a new dedicated `<comment_policy>` XML block (placed between `<approach_check>` and `<repo_hygiene>`), not folded into an existing block. **Why:** the file organizes conduct rules into named XML blocks; comments are code-writing conduct, not repo hygiene, so a small dedicated block matches the file's structure better than stretching `<repo_hygiene>`'s meaning.
- [high] The agent-file standing rule uses default-allow polarity ("only when the spawning prompt does not forbid it"), not the How-step's default-deny phrasing ("unless the prompt explicitly allows"). **Why:** default-deny in the GLOBAL agent file would suppress plan-referencing comments for every project, including ones with `plan_comments: true` or missing — breaking the backwards-compatible missing-key = allowed contract. Segment instructions specified the default-allow wording.
- [high] README gained a one-paragraph `plan_comments` note directly under the File Structure block (plus the key added to the `config.json` comment line), rather than a new init-walkthrough section. **Why:** README nowhere walks through init questions individually, so a walkthrough would be a new doc pattern; the config-key note is the minimal accurate change.

## Changes
- `skills/plan-init/SKILL.md` — `"plan_comments": true` added to config template (step 6); new step 8 "Ask about plan references in code comments" (AskUserQuestion, contextual recommendation from git-tracking outcome, writes `false` on "No plan references"); old steps 8–11 renumbered to 9–12 with cross-references fixed; confirmation display lists the choice
- `skills/plan-execute/SKILL.md` — step 9 reads `plan_comments` once per run (explicit-false gate → `plan_comments_off`); conditional `## Code Comment Policy` section added to the step-11c segment template (after `## Project Context`), the step-13 issue-fix template, and the step-14c feedback-fix template; observation-fix spawn (11.b.6) and des-build route (**Comment policy:** bullet) both require the policy in their prompts when `plan_comments_off`
- `skills/plan-spawn/SKILL.md` — one-time step-2 config read extended to capture `plan_comments` (same gate, read-once rule respected); step 7b.3 prompt-field list names the conditional `## Code Comment Policy` section
- `skills/plan-review/SKILL.md` — fix-spawn instruction includes the policy block when `plan_comments` is explicitly `false`
- `agents/plan-executor.md` — new `<comment_policy>` block (lines 66–71): write plan/task/step-referencing comments only when the spawning prompt does not forbid it; follow a `Code Comment Policy` section strictly; prefer comments that explain the code (deliberately default-allow — default-deny in the global file would break the missing-key=allowed contract)
- `CLAUDE.md` — config.json key list now includes `plan_comments`
- `README.md` — key list updated + one-paragraph note describing `plan_comments` semantics (false forbids plan-referencing comments; missing = allowed)
- `agents/plan-executor.md` — new project-neutral `<comment_policy>` block: write plan-referencing comments only when the spawning prompt does not forbid it; follow a Code Comment Policy section strictly; prefer comments explaining the code
- `CLAUDE.md` — `plan_comments` added to the config.json key list in "File Structure Created by Skills"
- `README.md` — `plan_comments` added to the config.json comment line plus a one-paragraph description under the File Structure block

## Notes
Research confirmed `segment_threshold` is written by init but read nowhere — a cautionary precedent: verify the new key is actually consumed by every executor entry point (segment loop, observation-fix in execute *and* review, issue-fix, feedback-fix, spawn rounds, des-build route). Missing any one leaves a path that can still emit plan comments.
