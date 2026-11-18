# Plan-capture "elaborate" flag leaves status as pending

**ID:** 027
**Created:** 2026-07-27T16:03
**Type:** bug
**Status:** completed
**Branch:** fix/027-plan-capture-elaborate-flag-leaves-status
**Completed:** 2026-07-28T11:06

## What
Sometimes when running plan-capture with the "elaborate" flag, the plan gets elaborated but the plan status doesn't get updated from pending.

## Why
Improves reliability by fixing a status-tracking bug in the capture→elaborate chain. When a task is elaborated via the `auto_elaborate` chain (`/plan-capture <desc> elaborate` or `/plan-elaborate <desc>`), the task's Why/How/Verification get filled in but its `**Status:**` field can be left at `pending`. A stale status corrupts every downstream view (`/plan-status`, `/plan-list`, PROGRESS.md counts, the desktop dashboard) and can make `/plan-execute` mis-detect the task's lifecycle mode. The fix makes the status flip an isolated, hard-to-skip find-and-replace with a post-write read-back assertion, so a fully-elaborated task can never be silently left `pending`.

## How Summary
Root cause is in `plan-elaborate/SKILL.md` step 14 ("Update task file"): the status flip is a single soft sub-bullet — `- Update Status to `elaborated`` — buried beneath the long Build-proposal and skip-mode assumption-tracking prose, and it uses the weak "Update Status to X" wording instead of the canonical `Change Status from X to Y` find-and-replace form used by plan-execute/pause/complete. Under the `auto_elaborate` chain `skip_mode = true`, the assumption-tracking work is fully active, so the one-line flip is the easiest thing in a heavy step to drop — and nothing re-asserts it (the confirmation prints a hardcoded `Status: elaborated` literal, masking the miss). The fix strengthens and isolates the flip, adds a post-write read-back assertion that self-corrects and hard-stops the chain if the status is still `pending`, and turns the two confirmation echoes into reads of the file's actual `**Status:**` value. Scope is deliberately limited to the status flip + assertion; the pre-existing PROGRESS.md-stats gap in plan-elaborate is left out (see Assumptions).

**Files of note:**
- `skills/plan-elaborate/SKILL.md` — step 14 holds the buried/weak status flip (line ~534) and step 17 the literal `Status: elaborated` echo (line ~602); the fix lives here.
- `skills/plan-capture/SKILL.md` — step 12 auto_elaborate chain prints the abbreviated `Elaborated #NNN …` confirmation (line ~261) with no status echo; template Status line is `**Status:** pending` (step 6, line ~94).
- `skills/plan-execute/SKILL.md` — canonical `Change Status from `pending` or `elaborated` to `in-progress`` phrasing (line ~473) to mirror.
- `skills/plan-pause/SKILL.md`, `skills/plan-complete/SKILL.md` — additional canonical `Change Status …` reference phrasings.

## How
- [x] Step 1: In `skills/plan-elaborate/SKILL.md` step 14, replace the weak flip `- Update Status to `elaborated` (the file stays in `.plans/pending/`)` (line ~534) with the canonical from→to, find-and-replace form: `- Change Status from `pending` to `elaborated` — rewrite the `**Status:** pending` header line to `**Status:** elaborated`. The file stays in `.plans/pending/`.` (mirror the `Change Status from X to Y` wording used in `plan-execute/SKILL.md:473`).
- [x] Step 2: Pull the status flip out of the crowded "Update task file" step so it is not buried under the Build-proposal and skip-mode assumption-tracking prose — either promote it to its own numbered step (e.g. a dedicated "Set Status to elaborated") placed after `- Write the updated file` (line ~568), or make it the first, standalone bullet of step 14. Renumber subsequent steps and any in-text step references consistently if a new step is introduced.
- [x] Step 3: Add an explicit post-write read-back assertion immediately after the file is written: re-read the task file and confirm the `**Status:**` line now reads `elaborated`; if it still reads `pending`, rewrite it. If it cannot be corrected, hard-stop the chain (do NOT proceed to auto-execute) and surface the problem — since a still-`pending` task can make `/plan-execute` mis-detect its lifecycle mode.
- [x] Step 4: Make the two confirmation echoes read the file's actual `**Status:**` value instead of printing a hardcoded literal: (a) `plan-elaborate/SKILL.md` step 17 full confirmation (the `Status: elaborated` line, ~602), and (b) `plan-capture/SKILL.md` step 12 abbreviated `Elaborated #NNN: [Title] (N steps)` line (~261) — augment it to include the read-back status so a missed flip surfaces in the chain rather than being masked.
- [ ] Step 5: Manually verify end-to-end (see Verification): run the `auto_elaborate` chain and a direct `/plan-elaborate NNN`, and confirm both leave `**Status:** elaborated` on disk. ⏳ Deferred to review (worktree mode) @ be51caa — reviewer to perform.

## Verification
- Run `/plan-capture "Test status flip" elaborate` (or `/plan-elaborate "Test status flip"`) end-to-end in a scratch `.plans/` and confirm the resulting task file on disk contains `**Status:** elaborated` (not `pending`).
- Run a direct `/plan-elaborate NNN` on a freshly-captured `pending` task and confirm the same — the flip works on both the chained (skip_mode) and interactive paths.
- Confirm the new post-write assertion catches and corrects a missed flip: the confirmation output now reflects the file's real `**Status:**` value (not a hardcoded literal), so a stale `pending` would be surfaced rather than masked.
- Confirm `/plan-status` and `/plan-list` count the elaborated task under Elaborated (not Pending) after the chain runs.
- No regression to a direct `/plan-elaborate NNN` on an already-`elaborated`/`in-progress` task (Path C must still preserve the existing status, not force it to `elaborated`).

## Impact Scope

### Files to Modify
- [ ] `skills/plan-elaborate/SKILL.md` — reword + isolate the step-14 status flip; add a post-write read-back assertion; make the step-17 confirmation echo the file's real status.
- [ ] `skills/plan-capture/SKILL.md` — augment the step-12 abbreviated auto_elaborate confirmation to read the task's real `**Status:**` back rather than assume success.

### Related Files (may need updates)
- `skills/plan-execute/SKILL.md` — reference only, for the canonical `Change Status from X to Y` phrasing; not modified.
- `skills/plan-pause/SKILL.md`, `skills/plan-complete/SKILL.md` — reference only, for canonical phrasing; not modified.

### Endpoints/UI Affected
- `/plan-capture <desc> elaborate` chain and `/plan-elaborate <desc>` — the task's on-disk `**Status:**` will now reliably be `elaborated` after elaboration.
- `/plan-status`, `/plan-list`, PROGRESS.md counts, and the desktop dashboard — Pending vs Elaborated counts derived from the status field become accurate.

## Assumptions

### Initial (from elaboration)
- [high] Root cause is the buried, weakly-worded status flip in `plan-elaborate` step 14 — NOT an off-by-one in plan-capture's "follow its steps 1–15" delegation (step 14 is inside that range). Fix targets the flip wording + isolation, mirroring the canonical `Change Status from X to Y` form used by plan-execute/pause/complete. **Why:** research quoted the exact lines and found three sibling skills use the stronger from→to phrasing while elaborate uses a soft "Update Status to X" sub-bullet under heavy skip-mode prose; the range-mismatch hypothesis in the task brief does not hold.
- [low] The new post-write assertion should **self-correct and then hard-stop the chain** if the status is still `pending` after a correction attempt (rather than silently continuing), because a still-`pending` task can make `/plan-execute` mis-detect its lifecycle mode on the auto_execute path. **Why:** this was an open question in research; the safer choice for the autonomous chain is to fail loud rather than execute a mis-statused task.
- [low] Scope is limited to the status flip + read-back assertion + confirmation echoes; the broader "plan-elaborate never updates PROGRESS.md Pending/Elaborated stats" gap is intentionally left OUT of this task. **Why:** research flagged it as a pre-existing, separate gap (even a successful elaborate doesn't refresh those stats today); folding it in would enlarge the change and blur the bug fix. It can be a follow-up task if accurate live counts are needed.
- [high] Also update the two confirmation echoes to read the file's actual `**Status:**` value instead of printing a hardcoded `elaborated` literal. **Why:** research showed the current confirmations print "Status: elaborated" even when the file still says pending, masking the very failure being fixed — a read-back makes the miss visible.
- [high] No `**Build:**` route added — this is a skill-logic bug fix, not a design-system component build, and the repo's `design-system/` build path is irrelevant here. **Why:** the `**Build:**` field is only for tasks that build des-* components; this task edits SKILL.md instruction text.

### Discovered during execution
- [low] For Step 2 I chose the **standalone-bullet** option (made the status flip the first, standalone bullet of step 14) rather than promoting it to a new numbered step. **Why:** the segment brief explicitly preferred the lower-risk option "unless promotion is clearly better"; a standalone bullet needs no renumbering and no in-text step-reference edits (steps 15/17 stay valid), so it is strictly less disruptive while still un-burying the flip.
- [high] Mirrored the canonical `Change Status from `pending` to `elaborated`` phrasing from `plan-execute/SKILL.md:473`, and made the from→to rewrite fire only when the current status is `pending` (leaving `elaborated`/`in-progress`/later untouched). **Why:** the from→X→to→Y form naturally guards Path C (a direct re-elaborate on an already-advanced task must preserve its status), matching the segment's Path C guardrail; the phrasing is a clear pattern-match to three sibling skills.
- [low] Worded the post-write read-back assertion to self-correct once (rewrite if still `pending`) and then hard-stop the chain (no auto-execute, surface to user) if it cannot be made to stick. **Why:** matches the Initial `- [low]` assumption's "fail loud rather than execute a mis-statused task" decision; exact wording was a judgment call.
- [low] For the plan-capture step-12 echo I both augmented the abbreviated line to include the actual status AND added an explicit warning + chain-stop when the read-back is still `pending`. **Why:** the brief asked to surface a missed flip in the chain; a passive status echo alone could still scroll by unnoticed, so an explicit warning + stop makes the failure actionable. Wording was a judgment call.

## Changes

**`skills/plan-elaborate/SKILL.md`** (step 14 "Update task file" + step 17 confirmation):
- Replaced the weak `- Update Status to `elaborated`` sub-bullet with the canonical from→to form `Change Status from `pending` to `elaborated` — rewrite the `**Status:** pending` header line to `**Status:** elaborated``, mirroring `plan-execute/SKILL.md`. Made it the **first, standalone bullet** of step 14 (un-buried from the Build-proposal / skip-mode prose; no renumbering needed).
- The rewrite explicitly fires only when the current status is `pending` — an already-`elaborated`/`in-progress`/later status is left untouched (preserves Path C: direct re-elaborate keeps existing status).
- Added a **post-write read-back assertion** immediately after `- Write the updated file`: re-read the file, confirm `**Status:**` is `elaborated`, self-correct once if still `pending`, and hard-stop the chain (no auto-execute, surface to user) if it cannot be made to stick.
- Step 17 full confirmation now echoes `Status: [actual **Status:** value read back from the file]` instead of a hardcoded `elaborated` literal.

**`skills/plan-capture/SKILL.md`** (step 12 auto_elaborate chain confirmation):
- Abbreviated echo now reads `Elaborated #NNN: [Title] (N steps, status: [actual **Status:** value])` — the status is read back from the file rather than assumed.
- Added an explicit warning + chain-stop: if the read-back status is still `pending`, print a warning and STOP (do not auto-execute a mis-statused task).

Scope held to the status flip + read-back + confirmation echoes; the pre-existing PROGRESS.md-stats gap in plan-elaborate was intentionally left out (per Assumptions). Reference-only skills (plan-execute/pause/complete) consulted but not modified.

## Notes
Key file:line anchors from research (verify before editing, line numbers may drift):
- `plan-elaborate/SKILL.md:534` — the weak `- Update Status to `elaborated`` flip (step 14).
- `plan-elaborate/SKILL.md:568` — `- Write the updated file` (assertion goes right after).
- `plan-elaborate/SKILL.md:602` — the literal `Status: elaborated` in the step-17 confirmation.
- `plan-capture/SKILL.md:261` — abbreviated `Elaborated #NNN: [Title] (N steps)` chain confirmation.
- `plan-capture/SKILL.md:94` — task template `**Status:** pending` (the exact string a fix replaces).
- Canonical phrasing to mirror: `plan-execute/SKILL.md:473`, `plan-pause/SKILL.md:56`, `plan-complete/SKILL.md:195`.
