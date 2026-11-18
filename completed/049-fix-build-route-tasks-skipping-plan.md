# Fix build-route tasks skipping plan-execute finish handling and never getting a review page

**ID:** 049
**Created:** 2026-10-06T09:55
**Type:** bug
**Status:** completed
**Completed:** 2026-10-06T11:20
**Branch:** fix/049-fix-build-route-tasks-skipping-plan

## What
Fix build-route tasks skipping plan-execute finish handling and never getting a review page. A task whose How steps are all **Build:** units skips the plan-executor loop, but on main the finish handling (11c.5 visual comparison, 11d summary, 11e worktree commit + review status) is nested under the plan-executor section and reached only by a soft "fall through" sentence (skills/plan-execute/SKILL.md:699), so a pure build-route task can stop uncommitted and stuck in-progress.

Port the unmerged fix from local branch `fix/build-route-finish-handling` (6b2622f — conflicts with main, re-apply by hand, do not merge):
- Hoist finish handling into a shared, route-agnostic Step 11.5 that both routes explicitly converge on, with a finish preflight.
- Warn in plan-execute and des-build that des-build's `🟢 BUILT` marker is not a task terminal.
- Stale `index.lock` recovery for worktree commits.
- Fix 7e/11.5 cross-refs in plan-execute and plan-spawn.

Skip the per-unit bookkeeping part — main already has it imperative (lines 694-697).

Also fix two gaps added since the branch was cut:
1. The `/review/<slug>` page is only created inside the plan-executor prompt template (~line 900), so a pure build-route task never gets one and 11c.5 always fails with "review page returned 404" — the build route must create it when no plan-executor segment will.
2. The build route writes to the state file before Step 11a creates it.

Once ported, delete the old branch.

## Why
Improves reliability by making a pure `**Build:**`-routed task actually finish. Today it can stop after des-build with an uncommitted branch and the status stuck at `in-progress`. When it does reach the visual comparison, that always fails, because no review page was ever created. That is the silent-degradation path the build-route contract exists to prevent.

## How Summary
Re-apply 6b2622f by hand on top of current main. Finish handling becomes one route-agnostic top-level step `11.5. **Finish handling**`, which absorbs main's newer 11c.5 visual comparison as 11.5a, with the old 11d → 11.5b and 11e → 11.5c, plus a finish preflight. Both the build route and the plan-executor route must converge on it explicitly. State-file creation is hoisted ahead of both routes. A pure build route gets its review page from a one-off plan-executor spawn. des-build's three markers are declared non-terminal when an orchestrator invokes it. Stale `index.lock` recovery is added at every worktree commit site. Cross-references are fixed across plan-execute, plan-spawn, plan-review, plan-init, agents/plan-executor.md, and CLAUDE.md.

**Files of note:**
- `skills/plan-execute/SKILL.md` — Step 11 restructure, new Step 11.5, edge cases, cross-refs
- `skills/des-build/SKILL.md` — Step 9: markers are not a task terminal when orchestrated
- `skills/plan-spawn/SKILL.md` — 11e/11a refs, index.lock recovery at its worktree commit
- `CLAUDE.md` — `**Build:**` contract bullet, visual-comparison paragraph (review page source), `11c.6` ref
- `skills/plan-review/SKILL.md`, `skills/plan-init/SKILL.md`, `agents/plan-executor.md` — `11c.5` / `11c.6` cross-refs

## Diagnosis

**Most likely:** Finish handling (11c.5/11d/11e) is nested under the "MANDATORY: Spawn plan-executor" section. A pure build route is told to "skip the plan-executor loop entirely", and only a soft "fall through to 11d/11e" sentence points it back (`skills/plan-execute/SKILL.md:698-699`). The model skips ~300 lines and stops at des-build's `🟢 BUILT … → Next:` marker, which reads as a finished hand-off (`skills/des-build/SKILL.md:152-155`).
**Evidence:** headings at plan-execute:701 (plan-executor section), 956 (11c.5), 998 (11d), 1020 (11e). Line 699 does not even name 11c.5. No text says des-build's marker is non-terminal.
**Confidence:** high

**Alternative:** Gap 1 — the review page is only created by the plan-executor prompt template (`skills/plan-execute/SKILL.md:900-916`), so a pure build route reaching 11c.5 polls a page that does not exist and records "returned 404" (`:972-973`). — **Confidence:** high (co-occurring cause, not competing)
**Alternative:** Gap 2 — the build route writes `## Key Decisions` / `## Observations` to the state file (`:697`) before Step 11a creates it (`:703-736`). — **Confidence:** high (co-occurring)

**To confirm:** grep plan-execute on main and verify that 11c.5/11d/11e sit under the plan-executor heading after the build route's "skip the plan-executor loop" line, that `Review Page` appears only inside the 11c template, and that the state file is only created at 11a.

## How
- [x] Step 1: Confirm the Diagnosis on main by grepping `skills/plan-execute/SKILL.md` (heading order around 672-1020, the `## Review Page` location, the state-file creation site). Agent-verifiable, so untagged.
- [x] Step 2: Restructure Step 11's opening in `skills/plan-execute/SKILL.md`:
  - Hoist state-file creation (old 11a) ahead of BOTH routes, adding a `## Build Units` list when `build_route` is set.
  - Add review-page creation to the build route. When `build_route` is set and no plan-executor segment will run, spawn a one-off plan-executor (`model: [executor_model]`) whose prompt is the existing Review Page section verbatim.
  - Add the "des-build's marker is NOT the task's terminal" bullet.
  - Replace the fall-through sentence (and the mixed-tasks line) with an imperative "you MUST continue to Step 11.5".
- [x] Step 3: Create a top-level `11.5. **Finish handling** (route-agnostic)` step:
  - Move 11c.5 → 11.5a (visual comparison), 11d → 11.5b (non-worktree finish), 11e → 11.5c (worktree finish).
  - Open with a neutral dispatcher plus a finish preflight. The state-file check is unconditional. The commit check is "≥1 commit, or explicitly recorded as no changes".
  - Add stale-`index.lock` recovery at the single- and multi-repo commits. Locate the lock with `git rev-parse --git-dir`, and remove it only when no git process is running.
  - Add the two edge cases from the branch.
- [x] Step 4: Fix cross-refs:
  - plan-execute: 11e→7e at Contract #3, Step 3 yolo-discuss, and the yolo-discuss edge case. All 11d/11e/11c.5 refs → 11.5x. Dangling `11c.6` → `11b.6`.
  - plan-spawn: 11e→11.5c, 11a ref. Add index.lock recovery at its worktree commit.
  - `skills/plan-review/SKILL.md` and `skills/plan-init/SKILL.md`: 11c.5 → 11.5a.
  - `agents/plan-executor.md`: `11c.6` → `11b.6`.
- [x] Step 5: In `skills/des-build/SKILL.md` Step 9, add the orchestrator note: `🟢 BUILT`, `🔵 VERIFIED`, and `🔵 CODE-ONLY CHECK` end des-build only, never the caller's task.
- [x] Step 6: Update `CLAUDE.md`:
  - `**Build:**` contract: add a bullet saying the des-build marker is non-terminal and finish converges on plan-execute Step 11.5.
  - Visual-comparison paragraph: the review page comes from the plan-executor segment, or from a one-off spawn on a pure build route.
  - Fix `11c.6` → `11b.6`.
  - Then grep the repo for stale `11c.5`/`11d`/`11e`/`11c.6` refs and run `node --test test/package-files.test.js`.
- [x] Step 7: Once ported, delete the local branch `fix/build-route-finish-handling`, printing its SHA (6b2622f) so it can be recovered.

## Verification
- On the task branch, `grep -n` shows `11.5. **Finish handling**` as a top-level step after the plan-executor section. Both the build route and 11b point to it imperatively, and no `11c.5`/`11d`/`11e`/`11c.6` references remain in skills/, agents/, or CLAUDE.md (plan-capture's own unrelated `11.5` excepted).
- The build route creates the state file before writing to it, and creates the review page when no plan-executor segment will.
- des-build Step 9 says its three markers are not a task terminal when orchestrated.
- `node --test test/package-files.test.js` passes, and `git branch --list fix/build-route-finish-handling` is empty.

## Impact Scope

### Files to Modify
- [ ] `skills/plan-execute/SKILL.md` — Step 11 restructure, new Step 11.5, edge cases, cross-refs
- [ ] `skills/des-build/SKILL.md` — Step 9 non-terminal marker note
- [ ] `skills/plan-spawn/SKILL.md` — cross-refs + index.lock recovery
- [ ] `CLAUDE.md` — Build contract bullet, review-page paragraph, 11c.6 ref
- [ ] `skills/plan-review/SKILL.md` — 11c.5 ref
- [ ] `skills/plan-init/SKILL.md` — 11c.5 ref
- [ ] `agents/plan-executor.md` — 11c.6 ref

### Related Files (may need updates)
- `skills/plan-capture/SKILL.md` — has its own unrelated `11.5.` step; must NOT be touched

## Assumptions

### Initial (from elaboration)
- [high] Absorb main's 11c.5 into Step 11.5 as its first sub-step (11.5a) rather than placing 11.5 at the old "d." position as the branch did. **Why:** 11c.5 postdates the branch and is finish work. Leaving it under the plan-executor section would keep a pure build route skipping the visual comparison.
- [high] Format Step 11.5 as a top-level `11.5. **Finish handling**` list item, not the branch's `## Step 11.5:` H2 + `---`. **Why:** that matches the file's `N. **Title**` step style and plan-capture's `11.5.` precedent, and avoids breaking list continuity.
- [low] Create the pure-build-route review page via a one-off plan-executor spawn carrying only the existing Review Page section. **Why:** that honors Execution Contract #2 without a new orchestrator-writes-files exception and reuses the template verbatim. The alternatives are the orchestrator writing it (contract exception) or des-build creating it (breaks des-build's single responsibility).
- [low] One review page per task at `/review/<slug>`, with `<slug>` = the task filename stem minus the `NNN-` prefix, unless project conventions say otherwise. It renders every build unit. **Why:** nothing on main defines the slug, and 11c.5 already measures one page per task across multiple frames.
- [low] A non-worktree pure build route still proceeds to steps 12-14 after 11.5b, exactly like a plan-executor task. **Why:** 11d leads there today, and the branch is silent. Diverging would be a new behavior.
- [low] The finish preflight's commit check accepts "≥1 commit OR explicitly recorded no-changes" rather than strictly ≥1 commit. **Why:** a build that legitimately changed nothing should not be forced into a fake failure.
- [low] Fix the pre-existing dangling `11c.6` → `11b.6` refs (plan-execute, agents/plan-executor.md, CLAUDE.md) as part of the cross-ref sweep. **Why:** they are the same class of defect in the same files, and the fix is cheap.
- [low] plan-spawn's missing `**Build:**` routing (it has the Skill tool but no build_route handling) is OUT of scope. **Why:** the task scopes plan-spawn to cross-ref fixes. It should be captured as a follow-up rather than silently expanded here.

### Discovered during execution
- [high] Kept the hoisted state-file creation lettered as `11a` instead of re-lettering it away. **Why:** with 11a hoisted ahead of both routes, the plan-executor sub-steps keep `b.` and `c.`. Existing `11b`/`11c` references stay valid, and the planned `11c.6` → `11b.6` fix lands on the real observation item.
- [high] Did the move in place. Inserted the `11.5.` header and preflight directly above the old c.5, then re-lettered c.5/d/e → a/b/c. **Why:** c.5, d, and e were already the tail of Step 11, right before 12. No content had to physically move, which removes any risk of corrupting the visual-comparison text or the canonical teardown.
- [low] Added the slug definition inside the 11c template's `## Review Page` section too, as a bracketed orchestrator placeholder, and added "update it rather than adding another". **Why:** the plan-executor creates the page on mixed or non-build tasks, so it needs the same slug that 11.5a polls. Otherwise the two can disagree and 11.5a records a 404. This changes template text that the one-off spawn passes verbatim, which is intended.
- [low] Gated the one-off review-page spawn on "no plan-executor segment will run". It is also skipped when the page already exists (resume). **Why:** the 11c template includes the Review Page section whenever `build_route` is set, so any mixed task already gets the page from a segment.
- [low] Added an explicit item 9 to 11b ("After the last segment completes, you MUST continue to Step 11.5"). **Why:** the step asked for the plan-executor flow to point at 11.5 imperatively. 11b's numbered list was the natural spot, and the 11.5 opener cites it.
- [low] The `## Build Units` state-file section uses `pending`/`built` values and drives resume, so already-built units are skipped. **Why:** resuming a partially built route otherwise re-invokes des-build on finished units. The section is omitted when `build_route` is unset, so non-routed state files are unchanged.
- [low] Updated the two `11c.5` references inside the build-route `verify` bullet to `11.5a` in this segment. **Why:** that bullet is in text this segment rewrote. Every other stale ref (Contract #3, Step 3, line 556 `11c.6`, the `yolo discuss` edge case) is left for the cross-ref segment.
- [low] Remaining `step 11c` references (plan-execute Step 1.5, the build-route bullets, plan-spawn's prompt construction, plan-review's comment-policy fix) were left unchanged. **Why:** 11c is still the segment prompt template, and every one of them points at the template.
- [low] plan-spawn's stale-`index.lock` rule ends with "report it for that task and move on to the next" rather than stopping the whole finish. **Why:** plan-spawn's finish is serialized per task and a blocked task already just stops itself while the batch rolls on. One task's lock should not strand every other worktree.
- [low] The agent fallback comment in `agents/plan-executor.md` lists the call sites as `11/11b/11b.6/11.5a/13/14`. **Why:** `11` is the build route's one-off review-page spawn, and `11b.6` matches the existing `11b.N` shorthand plan-spawn already uses for 11b's numbered items.

## Changes
- **Segment 1** (`skills/plan-execute/SKILL.md`): confirmed the Diagnosis on main.
  - State-file creation is hoisted to 11a, ahead of both routes, with a `## Build Units` list.
  - The build route now skips already-built units on resume. It has a "des-build's marker is NOT the task's terminal" bullet covering all three markers. It creates the review page with a one-off plan-executor spawn when no segment will. It must continue to Step 11.5.
  - The slug definition is shared by the 11c `## Review Page` template and 11.5a.
  - The new top-level `11.5. **Finish handling**` holds the entry paragraph and Finish preflight, a. visual comparison (formerly c.5), b. non-worktree finish with a neutral dispatcher (formerly d.), and c. worktree finish (formerly e.).
  - Stale `index.lock` recovery is at the single-repo commit (located via `rev-parse --git-dir`) and referenced from the multi-repo commit.
  - Two Edge Cases bullets added. `node --test test/package-files.test.js` passes.
- **Segment 2:**
  - Fixed cross-refs:
    - plan-execute:37, 269, 556 and the yolo-discuss edge case: 11e→7e, the executor spawn-site list.
    - `skills/plan-spawn/SKILL.md:282`: 11e→11.5c. Also added a stale-`index.lock` recovery line at its worktree commit.
    - `skills/plan-review/SKILL.md:261` and `skills/plan-init/SKILL.md:204`: 11c.5→11.5a.
    - `agents/plan-executor.md:12`: 11c.6→11b.6 etc.
    - `CLAUDE.md:438`: executor call sites.
  - `skills/des-build/SKILL.md` Step 9 has a new bullet: the marker is not a task terminal when an orchestrator calls des-build.
  - `CLAUDE.md`:
    - New `**Build:**` bullet: the marker is non-terminal, finish converges on Step 11.5, and the state file and review page are covered on a pure build route.
    - The visual-comparison paragraph now says one review page per task at `/review/<slug>`, created by a segment or by a one-off spawn.
  - A grep finds no stale `11c.5`/`11c.6`/`11d`/`11e` refs.
  - Deleted local branch `fix/build-route-finish-handling` (was `6b2622f2757735bdda3090d10baea6bde02b4526`; recover with `git branch fix/build-route-finish-handling 6b2622f`). No remote branch existed.
  - `node --test test/package-files.test.js` passes.

## Notes
_Additional context_
