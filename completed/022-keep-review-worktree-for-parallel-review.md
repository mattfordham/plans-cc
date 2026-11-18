# Keep Review Worktree For Parallel Review

**ID:** 022
**Created:** 2026-06-30T09:00
**Type:** feature
**Status:** completed
**Branch:** feature/022-keep-review-worktree-for-parallel-review
**Completed:** 2026-06-30T09:00

## What
Add an opt-in `keep` keyword to `/plan-execute` that preserves the execution worktree instead of removing it at the end of execution, and have `/plan-review` use that worktree in place (cd into it) when the task still carries a live `**Worktree:**` field. This unlocks parallel/concurrent review — multiple tasks reviewable at once — **including single-repo projects**, which today serialize review because every single-repo review occupies the one shared main checkout.

## Why
Concurrent review already works for multi-repo projects with disjoint repo sets (commit 7d6723e), but single-repo projects still review one task at a time because there is a single working directory. Each kept worktree is its own checkout, so reviewing *inside* it removes the shared-checkout contention entirely — making single-repo parallel review fall out naturally. The change is purely additive: the default (no `keep`) keeps today's "remove the worktree at execute end" behavior untouched.

## How Summary
Introduce an opt-in `keep` keyword in `/plan-execute` (implies `worktree_mode`, like `yolo`) that skips the worktree-removal at execution finish and leaves the `**Worktree:**` field on the task. That field becomes the "live worktree" signal the rest of the lifecycle reads: `/plan-review` cd's into the worktree instead of checking the branch out into main, and — critically — re-keys its concurrency guard so a task occupies the shared `MAIN` checkout *iff* it has no live worktree, which is what actually enables parallel single-repo review. Worktree teardown for kept worktrees moves to `/plan-complete` (after merge). `plan-pause` and `plan-cleanup` gain kept-worktree awareness, mirroring the existing `plan-backlog` "do not remove the worktree" precedent.

**Files of note:**
- `skills/plan-execute/SKILL.md` — parse `keep` (Arguments + Step 1/2); gate worktree removal at Step 11e single-repo (~854–897) and multi-repo finish (~899–941); auto-detect kept worktree on `in-review` resume (Step 6, ~301–318).
- `skills/plan-review/SKILL.md` — Step 3.5 use-worktree-if-present (don't error); Step 3.6 re-key MAIN sentinel to worktree-liveness (the unlock); Step 5 skip checkout when in-worktree; header note (line 19).
- `skills/plan-complete/SKILL.md` — new owner of kept-worktree teardown: remove worktree after merge (Step 14), then existing Step 8 strips the field.
- `skills/plan-pause/SKILL.md` — Step 6: commit in the worktree and leave it in place for kept-worktree review tasks; skip the main branch-switch.
- `skills/plan-cleanup/SKILL.md` — Step 6: add `in-review` to the not-orphaned status set so an actively-reviewed kept worktree isn't reaped.
- `skills/plan-backlog/SKILL.md` — reference precedent for "don't remove the worktree" (no edit needed).
- `CLAUDE.md` / `README.md` — lifecycle diagram, status glossary, concurrency note, worktree-mode docs.

## How
- [x] Step 1: In `skills/plan-execute/SKILL.md`, add `keep` keyword parsing. Mirror the existing `worktree`/`branch`/`discuss` detectors in the Arguments section (~48–86) and Step 1/2 parsing (~116–133): set `keep_mode = true` if `$ARGUMENTS` contains (case-insensitive) `keep`, `keep worktree`, or `keep wt`; strip the token before further parsing. **`keep_mode` implies `worktree_mode = true` and `branch_mode = true`** (matching how `yolo`/`worktree` cascade — no error path). State it composes freely with `worktree` and `yolo`. Update `argument-hint` to include `[keep]` and add examples (`/plan-execute 1 worktree keep`, `/plan-execute 1 yolo keep`).
- [x] Step 2: In `skills/plan-execute/SKILL.md` Step 11e (single-repo finish, ~854–897), gate the teardown on `keep_mode`. When false → unchanged (set `review`, `cd` to root, `git worktree remove`, strip `**Worktree:**`). When true → still commit and still set status `review`, but **skip `git worktree remove` and keep the `**Worktree:**` line**. Update the "Invariant after worktree removal" note (~871) to cover the kept case, and change the completion-summary "Worktree: cleaned up" line (~884) to "Worktree: kept at [path] for parallel review".
- [x] Step 3: In `skills/plan-execute/SKILL.md` multi-repo finish (~899–941), apply the same `keep_mode` gate: skip the per-repo `git worktree remove` (~907–908) and the `rm -rf .worktrees/NNN-slug` (~910), keep both `**Worktree:**` and `**Repos:**` fields, preserve the whole symlinked parent `.worktrees/NNN-slug/` tree. Update the multi-repo summary line (~928).
- [x] Step 4: In `skills/plan-execute/SKILL.md` Step 6 `in-review` resume (~301–318): when a kept `**Worktree:**` field is present and the path exists, auto-detect and reuse it (set cwd + `worktree_mode`) rather than presenting only "current directory vs new worktree". Mirror the existing path-exists/warn-and-strip logic already at ~310–318.
- [x] Step 5: In `skills/plan-review/SKILL.md`, teach Step 3.5 (~56–60) to read the `**Worktree:**` field first. If present and the path exists → `cd` into it and set `review_in_worktree = true` (do NOT error). The "trapped in a leftover worktree" error fires only when there is **no** `**Worktree:**` field but cwd is nonetheless inside `.worktrees/`. Update the header note (line 19) that currently asserts the worktree is always gone.
- [x] Step 6: In `skills/plan-review/SKILL.md` Step 5 checkout (~97–111): when `review_in_worktree` is true, **skip the `git checkout [branch]`** (the worktree already has the branch checked out); run all git commands from the worktree cwd. Keep the `.plans`-tracking safety guard (~107–110) enforced. Step 6 rebase (~113–154) needs no logic change beyond running from the worktree cwd.
- [x] Step 7: In `skills/plan-review/SKILL.md` Step 3.6 concurrency (~62–76), **re-key the `MAIN` sentinel to worktree-liveness** (the actual unlock): a task occupies the shared `MAIN` checkout **iff** it has NO live `**Worktree:**` field. A kept-worktree task is never assigned `MAIN`, so two single-repo kept-worktree reviews on disjoint repos no longer conflict; conflicts remain only when repo sets intersect with at least one side occupying main. Update the conflict-error wording and the Edge Cases note accordingly.
- [x] Step 8: In `skills/plan-complete/SKILL.md`, make completion the owner of kept-worktree teardown. After the merge (Step 14) and before the existing Step 8 field-strip (~195): if the task still has a live `**Worktree:**` field, `cd` to project root, run `git checkout [default]` + `git merge [branch]` from main, then `git worktree remove --force` (multi-repo: per-repo remove + `rm -rf .worktrees/NNN-slug`). Ordering is load-bearing: merge from main → remove worktree → strip field. Add an Edge Case: "Task completed with a kept worktree → remove it during completion."
- [x] Step 9: In `skills/plan-pause/SKILL.md` Step 6 (~86–120): for a kept-worktree review task, commit any stray changes **inside the worktree** and leave the worktree in place (mirror `plan-backlog` lines ~57–60); skip the main `git checkout [default-branch]` since main isn't on the task branch. Status transition `in-review` → `review` stays as today. Add an Edge Case.
- [x] Step 10: In `skills/plan-cleanup/SKILL.md` Step 6 orphaned-worktree cleanup (~114–127): add `in-review` to the matched live-status set (currently `in-progress`/`review`) so an actively-reviewed kept worktree is not flagged as orphaned. Keep the `.plans` safety guard (Step 7.5).
- [x] Step 11: Update docs. `CLAUDE.md`: lifecycle diagram (~88–104), the single-repo "one in-review at a time" concurrency note (~104, now "unless executed with `keep`"), and the `review`/`in-review` status glossary (~190–191) to mention the kept-worktree path. `README.md`: worktree-mode section (~119, ~178–219) to document the `keep` keyword and parallel review.
- [ ] Step 12: Manually walk the lifecycle in a scratch single-repo project: `/plan-execute <id> worktree keep` → confirm worktree survives and `**Worktree:**` persists; start a second `keep` task; confirm both reach `review` and both can enter `/plan-review` concurrently (no MAIN-sentinel block); `/plan-complete` one and confirm its worktree is torn down while the other's survives; `/plan-pause` an in-review kept task and resume it; run `/plan-cleanup` and confirm the live kept worktree is not reaped.

## Verification
- A single-repo project can have two `keep`-executed tasks both in `review`/`in-review` simultaneously — `/plan-review` on the second does NOT error with the shared-checkout conflict.
- Default behavior is unchanged: `/plan-execute <id> worktree` (no `keep`) still removes the worktree at execute finish and strips `**Worktree:**`, exactly as today.
- `/plan-review` on a kept-worktree task cd's into the worktree and skips the branch checkout; on a normal (field-absent) task it still checks out into main.
- `/plan-complete` on a kept-worktree task merges from main, removes the worktree, and strips the field; completing a non-kept task is unchanged.
- `/plan-cleanup` does not reap a worktree belonging to a live `in-review` task.
- Existing tasks already in `review` with no `**Worktree:**` field behave exactly as before (reviewed in main).

## Impact Scope

### Files to Modify
- [ ] `skills/plan-execute/SKILL.md` — parse `keep`; gate teardown (single + multi-repo); kept-worktree resume detection
- [ ] `skills/plan-review/SKILL.md` — use-worktree-if-present; re-key MAIN sentinel; skip checkout in worktree; header note
- [ ] `skills/plan-complete/SKILL.md` — own kept-worktree teardown after merge
- [ ] `skills/plan-pause/SKILL.md` — commit-in-worktree, leave-in-place for kept review tasks
- [ ] `skills/plan-cleanup/SKILL.md` — add `in-review` to not-orphaned status set
- [ ] `CLAUDE.md` — lifecycle diagram, concurrency note, status glossary
- [ ] `README.md` — worktree-mode / `keep` keyword docs

### Related Files (may need updates)
- `skills/plan-backlog/SKILL.md` — precedent for "don't remove the worktree"; verify no conflict with new kept-worktree state (likely no edit)
- `skills/plan-spawn/SKILL.md` — replicates execute's teardown; explicitly OUT of scope for v1 (note only)

### Endpoints/UI Affected
- `/plan-execute` argument surface — new `keep` keyword + updated `argument-hint`
- `/plan-review` concurrency behavior — single-repo parallel review now permitted for kept-worktree tasks

## Assumptions

### Initial (from elaboration)
- [high] `keep` implies `worktree_mode` (and `branch_mode`), matching how `yolo`/`worktree` cascade — no standalone-`keep` error path. **Why:** the existing keyword-cascade pattern (yolo→worktree→branch) is the established convention; a `keep` with no worktree would be meaningless, so cascading is the cleanest, lowest-surprise choice.
- [high] The live `**Worktree:**` field is the single source of truth for "is this task occupying its own checkout"; the Step 3.6 `MAIN` sentinel is re-keyed to "occupies MAIN iff no live `**Worktree:**` field." **Why:** research identified this as the precise invariant that unlocks single-repo parallel review and the main footgun if mis-set; deriving from worktree-liveness (not from single- vs multi-repo) is the correct key.
- [high] Worktree teardown for kept worktrees moves to `/plan-complete` (after merge), since `/plan-execute` no longer removes it. **Why:** completion is the only remaining lifecycle point that ends a kept worktree's life; plan-complete already strips a stale field defensively (Step 8) but never removed a worktree.
- [low] Scope is `/plan-execute` only for v1; `/plan-spawn` (which replicates execute's teardown) is explicitly excluded. **Why:** spawn already fans out N worktrees and would multiply live kept worktrees; the source description targets review parallelism via execute, and spawn is a separate orchestrator — deferring it keeps the change set minimal. Worth confirming at review.
- [low] On `in-review` resume, auto-detect and reuse the live `**Worktree:**` field rather than adding a third prompt option to the existing "current dir vs new worktree" question. **Why:** mirrors the existing path-exists resume logic and avoids prompt bloat, but the exact UX (auto vs ask) is a judgment call the description didn't specify.
- [low] Disk-growth GC and concurrent-`.plans`-commit serialization (research open questions 3 & 4) are out of scope for v1 — kept worktrees accumulate until `/plan-complete`, and the existing best-effort warn-on-fail `.plans` commit policy is deemed sufficient for concurrent review. **Why:** no evidence these are problems at expected concurrency; adding caps/locks now would be speculative. Flag for review if heavy parallel use is expected.

### Discovered during execution
- [high] Placed the `keep` keyword detector immediately after the YOLO detector (both in the prose Parsing rules and the Step 2 list), before the branch detector. **Why:** the task specified "right after the worktree/yolo detection" since keep governs worktree lifecycle; this matches the existing cascade ordering (worktree → yolo → branch).
- [low] On `in-review` resume, a stale (path-missing) kept worktree strips BOTH `**Worktree:**` and `**Repos:**` lines before falling through to the question. **Why:** the existing `in-progress` resume warn-and-strip logic only removes `**Worktree:**`, but since `**Repos:**` is only meaningful alongside a live worktree, removing it too keeps the task file consistent. The task said to mirror the existing logic, which strips only `**Worktree:**`; I extended it minimally for the multi-repo case.
- [low] On kept-worktree `in-review` resume, also restore `multi_repo_mode`/`relevant_repos` from a present `**Repos:**` field. **Why:** mirrors the existing `in-progress` multi-repo resume block, but the task spec for Step 4 only described the single-repo path-exists reuse; I extended it so kept multi-repo worktrees resume correctly rather than losing their repo context.
- [high] Worded the kept-case completion-summary line exactly as `Worktree: kept at [path] for parallel review` for both single- and multi-repo, with `[path]` being the absolute worktree path (single-repo) / `.worktrees/NNN-slug` path (multi-repo). **Why:** the task specified this wording verbatim for single-repo and said to mirror it for multi-repo.
- [high] Re-keyed the Step 3.6 `MAIN` sentinel so a task is assigned `MAIN` *iff* it has no live `**Worktree:**` field, and changed the conflict test from "either side is MAIN" to "**both** sides contain MAIN". **Why:** the segment's load-bearing invariant — a kept-worktree task reviews in its own checkout and never contends for the shared main directory — only holds if MAIN-vs-MAIN is the shared-checkout conflict; a single MAIN occupant must not block a worktree task that isn't using main.
- [low] For a single-repo *kept-worktree* task with no repo metadata, set its repo set to the **empty set** (rather than its single repo name) for concurrency purposes. **Why:** single-repo tasks have no `**Repos:**`/`(multi-repo:)` metadata to name the repo, so there is nothing to intersect on; the only thing that ever serialized them was the shared MAIN checkout, which a kept worktree removes. Empty set => always disjoint => concurrent review allowed, which is exactly the intended unlock. Judgment call on representation (empty set vs an unnamed singleton) — flagged for review.
- [low] For a no-worktree **multi-repo** review I added the `MAIN` sentinel to its repo set (named repos PLUS `MAIN`) so two no-worktree multi-repo reviews still conflict over the shared parent main checkout even when their named repos are disjoint. **Why:** the prior rule had single-repo-only `MAIN`; once MAIN is keyed on worktree-liveness, a no-worktree multi-repo review also occupies the shared main directory and must carry `MAIN`. This preserves the spirit of commit 7d6723e (only *kept-worktree* multi-repo reviews are the ones that became free to run concurrently). Ambiguous re-keying detail — the elaboration didn't spell out the no-worktree multi-repo case explicitly.
- [low] Extended the shared-checkout conflict-error wording to point the user at `keep` (`/plan-execute NNN worktree keep`) as the way to unlock concurrent single-repo review, in addition to the existing pause/complete advice. **Why:** with the re-key, `keep` is now the supported escape hatch for the single-repo serialization the error describes; surfacing it is the helpful nudge. Wording judgment call.
- [high] In plan-complete, implemented kept-worktree teardown as a new **Step 14b** (after the Step 14 merge, before the Step 15 .plans commit) rather than folding it into Step 14 or Step 8. **Why:** Step 14 is the interactive merge prompt and could end on "Skip merge"; a distinct step keeps the load-bearing "merge from main → remove worktree → strip field" ordering legible without entangling it with the AskUserQuestion branches. The field-strip stays in the existing Step 8 (no duplicate strip), with 14b explicitly delegating to it.
- [low] plan-complete Step 14b notes that Step 14's merge may have already merged the branch and says "do not merge twice" (confirm main is on default + merge landed). **Why:** the segment spec said to "merge from main" in 14b, but Step 14 already performs an equivalent `checkout default + merge` when the user picks a merge option; re-running would be a no-op at best and confusing at worst, so I made 14b idempotent with respect to Step 14's merge. Placement/ordering judgment call.
- [high] Extended plan-complete Step 8's strip to also remove `**Repos:**` for multi-repo tasks (previously it only mentioned `**Worktree:**`). **Why:** `**Repos:**` is only meaningful alongside a live worktree; once 14b removes the multi-repo worktree, leaving a `**Repos:**` field on the completed task would be stale metadata. Mirrors the same field-pairing the execute/backlog/pause paths treat together.
- [high] plan-pause: implemented the kept-worktree case as a leading branch in Step 6 that commits inside the worktree, skips the main checkout, and `continue`s to step 7 — gated on `in-review` status specifically (per segment spec). **Why:** the segment said this path applies to a kept-worktree *review* task; gating on `in-review` keeps the existing in-progress/no-worktree flows untouched and matches plan-backlog's worktree precedent (lines ~57–60).
- [low] plan-pause kept-worktree branch instructs omitting the "Switched to branch:" confirmation line. **Why:** no branch switch occurs (the work stays in the worktree, main is untouched), so showing a switched-branch line would be inaccurate; reused the existing "omit if no branch" convention already present in step 7. Wording judgment call.
- [high] plan-cleanup Step 6: added `in-review` to the live-status set and added an inline clarifying note that an actively-reviewed kept worktree is not orphaned. Left Step 7.5 (.plans tracking safety guard) entirely unchanged. **Why:** direct from segment spec; the inline note documents *why* in-review now counts as live so a future reader doesn't "simplify" it back.
- [high] Docs (Step 11): added `keep` to CLAUDE.md's "Shortcuts" paragraph alongside `yolo`, since that paragraph is the canonical inventory of `/plan-execute` keywords. **Why:** the segment said to add it "for consistency" wherever execute keywords are documented; the Shortcuts paragraph is exactly that place.
- [low] README: documented `keep` as a "Keep mode" prose block under the Git Integration table (paralleling the existing "Branch mode"/"Worktree mode" blocks) AND added a dedicated "Parallel review with kept worktrees" workflow example rather than folding it into the existing "Parallel tasks with worktrees" example. **Why:** the existing parallel example shows *serial* review (review task 3, then complete, then task 5); the kept-worktree unlock is specifically *concurrent* review, so a distinct example avoids muddying the two patterns. Match-the-surrounding-format judgment call.
- [low] Added a `/plan-execute <id> worktree keep` row to README's Git Integration command table. **Why:** the table lists `branch` and `use worktree` variants; omitting `keep` would leave the headline keyword undiscoverable from the table. Kept the one-line description focused on "keep it for review (enables parallel review)".
- [high] Did NOT document `/plan-spawn` + `keep` integration anywhere. **Why:** segment spec explicitly states spawn integration is out of scope for v1.

## Changes

**`skills/plan-execute/SKILL.md`** (Steps 1-4)
- Added `keep` / `keep worktree` / `keep wt` keyword parsing (`argument-hint`, Arguments "Parsing rules", Step 2 parsing, after the YOLO detector). `keep_mode` implies `worktree_mode` + `branch_mode`; composes with `worktree`/`yolo`; no standalone error path. Added examples `/plan-execute 1 worktree keep` and `/plan-execute 1 yolo keep`.
- Gated Step 11e single-repo finish teardown on `keep_mode`: kept case commits + sets `review` but skips `git worktree remove` and keeps `**Worktree:**`. Updated the invariant note and the summary line (`Worktree: kept at [path] for parallel review`).
- Applied the same gate to the multi-repo finish: skips per-repo remove + `rm -rf`, keeps `**Worktree:**` and `**Repos:**`, preserves the symlinked tree. Updated multi-repo summary line.
- Step 6 `in-review` resume auto-detects and reuses a live `**Worktree:**` (sets cwd + `worktree_mode`, restores multi-repo context from `**Repos:**`); stale path warns and strips the fields, falling back to the existing question.

**`skills/plan-review/SKILL.md`** (Steps 5-7)
- Step 3.5 reads `**Worktree:**` first: present + path exists → `cd` in, set `review_in_worktree = true` (no error). "Trapped in a leftover worktree" error now fires only when there is no field but cwd is inside `.worktrees/`. Updated the header note.
- Step 5 skips `git checkout [branch]` when `review_in_worktree` (worktree already on the branch), runs git from worktree cwd; `.plans` safety guard preserved. Step 6 rebase runs from worktree cwd.
- Step 3.6 re-keyed the `MAIN` sentinel to worktree-liveness: a task occupies shared `MAIN` iff it has no live `**Worktree:**` field. Conflict test changed from "either side is MAIN" to "both sides contain MAIN". Single-repo kept-worktree repo set = empty (always disjoint → concurrent review). Reworded conflict error to surface `keep`; updated Edge Cases.

**`skills/plan-complete/SKILL.md`** (Step 8)
- New Step 14b owns kept-worktree teardown in load-bearing order: merge from main → `git worktree remove --force` (multi-repo: per-repo remove + `rm -rf .worktrees/NNN-slug`) → field-strip delegated to existing Step 8. 14b is idempotent w.r.t. Step 14's merge. Step 8 strip extended to also remove `**Repos:**`. Added an Edge Case.

**`skills/plan-pause/SKILL.md`** (Step 9)
- Step 6 leading kept-worktree branch (gated on `in-review`): commits inside the worktree, leaves it in place, skips the main `git checkout [default-branch]`. `in-review` → `review` transition unchanged. Added an Edge Case.

**`skills/plan-cleanup/SKILL.md`** (Step 10)
- Step 6 orphaned-worktree matching adds `in-review` to the live-status set so an actively-reviewed kept worktree is not reaped. Step 7.5 `.plans` safety guard unchanged.

**`CLAUDE.md` / `README.md`** (Step 11)
- CLAUDE.md: amended the single-repo concurrency note with the `keep` exception; added `keep` to the Shortcuts keyword inventory; extended the `review`/`in-review` status glossary with the kept-worktree path.
- README.md: added a `worktree keep` row to the Git Integration table, a "Keep mode" prose block, a worktree-lifecycle note, and a "Parallel review with kept worktrees" workflow example.

**Out of scope (v1):** `/plan-spawn` + `keep` integration (noted, not implemented).

## Notes
_Additional context_
