# PROGRESS.md "Recently Completed" grows unbounded

**ID:** 028
**Created:** 2026-08-18T14:32
**Type:** bug
**Status:** completed
**Branch:** fix/028-progress-md-recently-completed-grows
**Completed:** 2026-08-18T15:03

## What
`/plan-complete` step 12 says to keep the last 5 entries in the "Recently Completed" section of PROGRESS.md, but nothing enforces the trim, so entries just accumulate.

Observed in `~/work/multi-repo-app`: **78 entries**, PROGRESS.md at **280K**.

This matters more than the sibling HISTORY.md size problem (task #029) because PROGRESS.md is *current-status* — read on the hot path to answer "what's happening now" — so stale bulk is a per-invocation context cost, not just disk. The two bugs compound: each stale entry also carries an overlong completion summary (the #029 defect).

Fix should be a hard enforced trim in `plan-complete` — truncate to 5 on **every** completion, so it self-heals rather than only preventing future drift — plus a one-time backfill to shrink already-bloated files.

Verify by completing a task in a project with an overlong Recently Completed list and confirming it drops to 5.

## Why
Improves reliability and reduces per-invocation context cost by fixing the unbounded growth of PROGRESS.md's "Recently Completed" section. PROGRESS.md is on the hot path — it's read to answer "what's happening now" — so stale bulk (78 entries / 280K observed) is a real cost every time the file is loaded, not just disk. The spec has always said "keep last 5"; this makes that bound actually enforced and self-healing.

## How Summary
Pure-markdown fix (no runtime code — consistent with the rest of the project, which manipulates PROGRESS.md entirely via skill instructions). Convert the soft "(keep last 5)" parenthetical in `plan-complete` step 12 into a mandatory, unconditional truncate-to-5 action that runs on every completion. Because truncate-to-5 is idempotent (a no-op when already ≤5), that same step is the self-healing backfill: the first completion after the fix drops a bloated list straight to 5 — no separate gated backfill mechanism is needed. `plan-cleanup` already rebuilds the section to last-5 from ground truth, so it serves as the on-demand backfill for projects that want to shrink immediately without waiting for the next completion; add one clarifying line there. The section is bounded strictly between the `## Recently Completed` and `## Stats` headings.

**Files of note:**
- `skills/plan-complete/SKILL.md` — step 12 (~lines 214-224): the bug site; replace the soft hint with an enforced trim.
- `skills/plan-cleanup/SKILL.md` — step 3 (~line 79): already computes "last 5"; add a note that it also corrects an over-long list (the on-demand backfill).
- `skills/plan-init/SKILL.md` — step 4 (~lines 90-91): canonical template; reference for section boundaries/placeholder, no change expected.
- `.plans/PROGRESS.md` (per-project) — the live artifact whose growth is being bounded; used to verify the fix.

## How
- [x] Step 1: Rewrite `plan-complete` step 12 (`skills/plan-complete/SKILL.md` ~lines 214-224) to split "Add to Recently Completed" into two explicit actions: (1) prepend the new `- **#NNN** - [Title] (completed [YYYY-MM-DD])` bullet at the top of the section (newest-first, matching current ordering; if the section holds only the `_No completed tasks yet_` placeholder, replace it rather than prepend above it); (2) **hard-truncate** — keep only the top 5 bullet lines and delete every bullet from the 6th onward, stopping at the `## Stats` heading. Phrase the truncate as mandatory ("This trim runs on every completion, even if the list is already over 5 — it self-heals legacy bloat"), using the codebase's existing strong-phrasing idiom (cf. "This is a hard block, not a warning").
- [x] Step 2: In the same step, add a one-clause note that the truncate is unconditional *because* it doubles as the one-time backfill (idempotent when already ≤5), so no separate gated backfill mechanism exists — this documents intent for future readers and prevents someone re-adding a redundant "detect >5 then backfill" branch.
- [x] Step 3: Add one clarifying line to `plan-cleanup` step 3 (`skills/plan-cleanup/SKILL.md` ~line 79) noting that rebuilding "last 5 completed" also corrects/backfills an over-long "Recently Completed" list — making `/plan-cleanup` the discoverable on-demand shrink path for already-bloated files.
- [x] Step 4: Sanity-check the neighboring skills that touch the section (`plan-reopen` step 8, `plan-delete` step 8, `plan-init` step 4) to confirm the new wording is consistent with them (single-line bullets, newest-first, section delimited by `## Recently Completed` … `## Stats`, empty state `_No completed tasks yet_`) and that none needs a matching change. Report if any inconsistency is found; do not change them unless required for consistency.
- [ ] 👁 Step 5: Manually verify against a bloated project: in a `.plans/` whose "Recently Completed" holds >5 entries (e.g. `~/work/multi-repo-app`, observed at 78), run `/plan-complete` on a task and confirm the section drops to exactly 5 (newest-first) and `## Stats` is untouched. Also confirm running `/plan-cleanup` there shrinks the section on demand. (Requires running the skills against a real bloated file; agent cannot self-observe this without executing a full completion.)

## Verification
- `plan-complete` step 12 contains an explicit, mandatory truncate-to-5 action (not just a parenthetical hint), with wording that stops the deletion at the `## Stats` heading and handles the placeholder/empty state.
- The truncate is documented as unconditional/self-healing so it serves as the backfill; no separate gated backfill subsystem was introduced.
- `plan-cleanup` step 3 notes it also corrects an over-long Recently Completed list.
- Manual check (Step 5): completing a task in a project with >5 entries drops "Recently Completed" to exactly 5 (newest first), leaving `## Stats` and other sections intact; `/plan-cleanup` independently shrinks a bloated file.
- No Node/`lib/`/`bin/` code was added — the fix stays pure-markdown, consistent with how every other skill manipulates PROGRESS.md.

## Impact Scope

### Files to Modify
- [ ] `skills/plan-complete/SKILL.md` — step 12: replace soft "(keep last 5)" with an enforced, unconditional truncate-to-5 action; add self-heal/backfill intent note.
- [ ] `skills/plan-cleanup/SKILL.md` — step 3: add one line noting the rebuild also corrects/backfills an over-long list.

### Related Files (may need updates)
- `skills/plan-init/SKILL.md` — canonical PROGRESS.md template (section order, placeholder); reference only, likely no change.
- `skills/plan-reopen/SKILL.md` / `skills/plan-delete/SKILL.md` — also edit the section (remove-one-entry); check for wording consistency, likely no change.

### Endpoints/UI Affected
- `/plan-complete` behavior — now enforces the 5-entry bound and self-heals bloated files on every completion.
- `/plan-cleanup` behavior — documented as the on-demand shrink/backfill path (no functional change; it already computes last-5).

## Assumptions

### Initial (from elaboration)
- [low] Fix stays pure-markdown (no `lib/`/`bin/` Node helper). **Why:** research confirmed no runtime code touches PROGRESS.md — every skill (init, complete, cleanup, reopen, delete) manipulates it via prose instructions; a helper would break the project's declarative, runtime-free design.
- [low] The one-time backfill is folded into the unconditional trim (and `/plan-cleanup`) rather than built as a separate gated "backfill mode". **Why:** truncate-to-5 is idempotent, so it's a no-op when already ≤5 and self-heals on the next completion; a separate gated subsystem would be redundant — the task description itself flags "would a backfill run every time (bad)" as the anti-pattern to avoid.
- [low] "Last 5" in plan-complete is interpreted positionally (top-5 after prepending) rather than re-derived by `**Completed:**` date. **Why:** plan-complete prepends in real completion-event order, so top-5 is the natural, simplest reading and matches the live file; `plan-cleanup`'s date-based rebuild remains the authoritative reconciler when ordering ever diverges (e.g. a backdated completion).
- [low] The bound stays hardcoded at 5 (not made configurable via `config.json`). **Why:** task #028 treats 5 as fixed spec; adding configurability is scope creep the source description didn't request.
- [high] Scope is limited to PROGRESS.md's "Recently Completed" section; HISTORY.md size/summary-cap and archiving are explicitly left to sibling task #029. **Why:** the task Notes and research both draw this boundary — #029 carries an unresolved cap-vs-sharding decision and an append-only constraint that does not apply to the bounded 5-item window here.

### Discovered during execution
- [high] Kept the two truncate rationale sentences (self-heal + backfill-is-idempotent) as prose bullets inside step 12 rather than a separate note block, matching the step's existing bullet style. **Why:** step 12 is a flat bullet list; a new heading or callout would be heavier than neighboring skills' phrasing.
- [high] Reused the codebase's existing strong-phrasing idiom verbatim as "This is a hard trim, not a warning." (cf. "This is a hard block, not a warning."). **Why:** the segment prompt and project conventions call out this exact idiom for mandatory rules.
- [high] Neighboring skills (plan-reopen, plan-delete, plan-init) needed no changes — they only remove-if-present or define the empty-state template, and are already consistent with newest-first single-line bullets and the `_No completed tasks yet_` placeholder. **Why:** none touch the length of the list, so the new truncate rule does not conflict with them.

## Changes
- `skills/plan-complete/SKILL.md` (step 12, "Update PROGRESS.md"): replaced the soft "(keep last 5)" parenthetical with two explicit ordered actions — (1) prepend the new bullet newest-first, replacing the `_No completed tasks yet_` placeholder when present; (2) a MANDATORY, unconditional hard-truncate-to-5 that stops at `## Stats`, phrased with the codebase idiom ("This is a hard trim, not a warning") and made explicit it runs on every completion to self-heal legacy bloat. Added a note that the trim doubles as the idempotent one-time backfill, so no separate gated backfill branch should be added.
- `skills/plan-cleanup/SKILL.md` (step 3): added one clarifying sub-bullet noting the rebuild-to-last-5 also corrects/backfills an over-long list, making `/plan-cleanup` the on-demand shrink path.
- Consistency check (step 4): read `plan-reopen` (step 8), `plan-delete` (step 8), and `plan-init` (step 4 template) — all consistent (single-line bullets, newest-first, `## Recently Completed`…`## Stats` delimiting, `_No completed tasks yet_` placeholder). No changes required.

## Notes
Sibling task: #029 (HISTORY.md summary cap + archive strategy). Both surfaced from the same investigation of `~/work/multi-repo-app` on 2026-08-18. Split apart because this one has no open design questions and is independently shippable; #029 carries a real decision (cap alone vs. cap + sharding).

Evidence at time of capture:
- `.plans/PROGRESS.md` — 280K, 78 "Recently Completed" entries (spec: 5)
- Trim rule lives at `skills/plan-complete/SKILL.md:216` ("keep last 5")
