# Reorder /plan-complete so it collects every decision and finishes the merge BEFORE it archives the task

**ID:** 055
**Created:** 2026-11-10T17:16
**Type:** bug
**Status:** completed
**Branch:** fix/055-reorder-plan-complete-merge-before-archive
**Completed:** 2026-11-10T19:11

## What
Reorder /plan-complete so it collects every decision and finishes the merge BEFORE it archives the task.

### Problem
skills/plan-complete/SKILL.md mutates plan state (step 8 update task file, step 9 move to completed/,
step 10 state-file cleanup, steps 11–12 HISTORY/PROGRESS) BEFORE it asks the merge question (step 14)
and before the merge can fail. Any interruption after step 9 leaves a task archived but unmerged:
- the user cancels / Ctrl-Cs at the "Merge branch" AskUserQuestion
- step 14 Case C refuses ("[target] is checked out at … not this session's working directory")
- step 14 Case D hits a merge conflict and STOPs
- step 14 Case B refuses over uncommitted changes
- a headless driver (the Plans desktop app runs /plan-complete via the Agent SDK and renders
  AskUserQuestion as buttons inside the plan's detail view) loses the UI for the question because the
  plan vanished from pending/ at step 9. The run then parks forever.

Observed for real (rota #078, 2026-11-10): the file was in completed/ and HISTORY/PROGRESS were updated,
but the branch was unmerged and the run was parked on "Merge branch". It had to be finished by hand.

### Desired order
1. Steps 1–7 as today (validation, checkbox check, issue check, verification display, debug cleanup).
   Ask every interactive question here, up front: the unchecked-steps / open-issues confirmations AND
   the "Merge branch" choice (Merge and delete / Merge and keep / Skip). Keep the exact header, question
   and option labels, and the hard rule that it MUST be an AskUserQuestion call.
2. Pre-merge git check (today's step 13).
3. Merge (today's step 14 A/B/C/D dispatch, unchanged logic), using the answer collected in (1).
   If Case B/C refuses or Case D conflicts: STOP with the task left exactly as it was (still in pending/,
   status unchanged, no HISTORY/PROGRESS/state edits). Say clearly that nothing was archived and
   /plan-complete NNN can be re-run.
4. Only after a successful merge (or an explicit "Skip merge"): update the task file, move it to
   completed/, clean up the state file, update HISTORY.md and PROGRESS.md (today's steps 8–12).
5. Kept-worktree teardown (14b): after the merge, run from the project root, never from inside the
   worktree being removed.
6. Commit .plans (15), then display the confirmation (16) in the unchanged format.

### Constraints
- Byte-for-byte unchanged behaviour otherwise: Resolve-target-branch contract, Base / plans-branch
  guards, the base-missing hard error, the A/B/C/D cases, the teardown sequence, the confirmation output.
- Task-branch deletion ("Merge and delete") still happens only after a successful merge.
- No question may be asked after the task file has moved out of pending/. Add that as an explicit
  invariant near the top of the SKILL.md (next to "Branch merge requires interactive prompt").
- Update any cross-references to step numbers (14b's "handled by step 8's existing field-strip" note,
  the edge-case list, other skills that cite plan-complete step numbers).
- Audit the other mutating skills (plan-delete, plan-backlog, plan-restore, plan-review, plan-execute's
  completion path) for the same pattern: any AskUserQuestion that comes after the task file is
  moved/renamed/deleted. Report what you find; fix the ones with the same bug.

### Done when
- Reading the new SKILL.md top to bottom, every AskUserQuestion comes before the first write under .plans/.
- The four failure cases above (cancel, Case B, Case C, Case D conflict) each leave the task untouched
  in pending/ and re-runnable.
- Run the repo's tests/lint, and reinstall so ~/.claude/skills picks up the change.

## Why
Improves reliability by fixing a destructive ordering bug: `/plan-complete` archives the task (status, move to `completed/`, state-file delete, HISTORY/PROGRESS) before it asks the merge question and before the merge can refuse or conflict. Any stop after the move strands the task — archived but unmerged, and un-re-runnable because step 2 only resolves from `pending/`. A headless driver (the Plans desktop app) also loses the task it renders the "Merge branch" buttons inside. Observed in rota #078 on 2026-11-10.

## How Summary
Rebuild `skills/plan-complete/SKILL.md` in decide → merge → archive order: resolve the target branch and run the plans-branch / base-missing guards early, collect every question (including "Merge branch") before any `.plans/` write, do the pre-merge check and the A/B/C/D merge, tear down a kept worktree from the project root, delete the branch only after that, and only then mutate plan state, commit, and confirm. Any refusal or conflict stops with the task untouched in `pending/`. Renumber the steps and update every step-number citation (internal, `CLAUDE.md`, `plan-cleanup`). Apply the same "ask first, mutate last" fix to `plan-delete` and `plan-reopen`.

**Files of note:**
- `skills/plan-complete/SKILL.md` — the reorder itself
- `skills/plan-delete/SKILL.md` — same bug ("Delete branch?" asked after the file is deleted)
- `skills/plan-reopen/SKILL.md` — same pattern ("Checkout branch?" asked after the file moves)
- `CLAUDE.md` — step-number citations (HISTORY append path, plans-branch hard-stop, inline-mode sweep note)
- `skills/plan-cleanup/SKILL.md` — cites `plan-complete` step 11/12 for the HISTORY row template

## Diagnosis
**Most likely:** Plan-state mutation steps (8 update task file, 9 move to `completed/`, 10 delete state file, 11 HISTORY, 12 PROGRESS) are ordered before the decision/failure steps (13 pre-merge commit, 14 guards + "Merge branch" AskUserQuestion + A/B/C/D dispatch). Every STOP in step 14 therefore fires after the task has left `pending/`.
**Evidence:** `skills/plan-complete/SKILL.md:200-241` (mutations) precede `:254-341` (question, guards, refusals). The skill's own text assumes the reverse order: the guards at `:263`/`:268` say "Leave status unchanged" though step 8 already set `completed`; Case C (`:310`) says "do not fall through to completion"; step 8 (`:203`) calls its field-strip the finish of "the teardown begun in step 14b"; 14b (`:345`) keys on a "live `**Confidence:** high
**Alternative:** Two secondary defects fall out of the same ordering — (a) no-branch tasks "skip to step 16" (`:245`, `:256`) and so never reach the step-15 `.plans` commit; (b) "Merge and delete" runs `git branch -d` (`:340`) before 14b removes a kept worktree that still has the branch checked out, so git refuses the delete.
**To confirm:** Re-read the current SKILL.md top to bottom and list each AskUserQuestion / STOP with its line number against the first `.plans/` write (step 8, `:200`); every STOP in step 14 should come after it.

## How
- [x] Step 1: Confirm the hypothesis — list every AskUserQuestion / STOP in `skills/plan-complete/SKILL.md` with line numbers against the first `.plans/` write (step 8) and record the result in Changes.
- [x] Step 2: Restructure `skills/plan-complete/SKILL.md` into decide → merge → archive order: add a step 3.5 that resolves `[target-branch]` once and runs the plans-branch guard and base-missing hard error (reused by step 7's diff); a step 8 "Ask about branch merge" holding the unchanged AskUserQuestion; step 9 pre-merge check (old 13); step 10 merge A/B/C/D (old 14, logic unchanged) where every refusal/conflict STOPs with an explicit "nothing was archived — task #NNN is still in pending/, re-run /plan-complete NNN" line; step 11 kept-worktree teardown (old 14b) run from the project root, then "Merge and delete" branch deletion; steps 12–16 the old 8–12 mutations; 17 commit; 18 confirmation (format unchanged). No-branch tasks route to step 12, not straight to the confirmation.
- [x] Step 3: Add Critical Requirement #4 next to "Branch merge requires interactive prompt": no question may be asked after the task file leaves `pending/` — every AskUserQuestion comes before the first write under `.plans/`, and any STOP before step 12 leaves the task untouched. Update every internal step cross-reference (Critical Requirements, auto-accept text, `MAIN`-checkout invariant, step 7, teardown/field-strip notes, confirmation notes, Edge Cases) and add edge cases for the four failure modes.
- [x] Step 4: Update external citations of plan-complete step numbers — `CLAUDE.md` (HISTORY append path, cleanup-history "indistinguishable from", plans-branch hard-stop ×2, the inline-mode "code-commit paths" note, which must now say the completion record is committed by the helper after the merge) and `skills/plan-cleanup/SKILL.md` (step 11/12 references).
- [x] Step 5: Fix the same pattern in `skills/plan-delete/SKILL.md` (move the "Delete branch?" AskUserQuestion before the file is deleted; apply the choice after PROGRESS/HISTORY) and `skills/plan-reopen/SKILL.md` (move the "Checkout branch?" question before the file moves; run the checkout after the moves). Leave plan-backlog, plan-restore, plan-review, plan-execute 11.5, plan-pause, plan-combine unchanged (audited: not affected).
- [x] Step 6: Verify — grep the new plan-complete SKILL.md and confirm every AskUserQuestion line precedes the first `.plans/` write step; grep the repo for stale `plan-complete` step citations; run `npm test`.

## Verification
- Reading `skills/plan-complete/SKILL.md` top to bottom, every AskUserQuestion (and every plain-text confirmation) comes before step 12, the first write under `.plans/`.
- Cancel at "Merge branch", Case B (dirty target checkout), Case C (foreign checkout), and Case D (conflict) each STOP before step 12 with a "nothing was archived … re-run /plan-complete NNN" message; the task stays in `pending/` with status unchanged.
- The "Merge branch" header, question, and three option labels, the A/B/C/D commands, the teardown sequence, and the step-18 confirmation format are textually unchanged.
- `grep -rn "plan-complete. step\|plan-complete\` [0-9]" CLAUDE.md skills/` shows only citations that match the new numbering; `npm test` passes.
- After merge: `~/.claude/skills/plan-complete` (a dev symlink into the main checkout) shows the new order.

## Impact Scope
**Files to modify:**
- `skills/plan-complete/SKILL.md`
- `skills/plan-delete/SKILL.md`
- `skills/plan-reopen/SKILL.md`
- `CLAUDE.md`
- `skills/plan-cleanup/SKILL.md`

**Related files (read, not modified):**
- `skills/plan-backlog/SKILL.md`, `skills/plan-restore/SKILL.md`, `skills/plan-review/SKILL.md`, `skills/plan-execute/SKILL.md`, `skills/plan-pause/SKILL.md`, `skills/plan-combine/SKILL.md` — audited, not affected
- `lib/plans-git.js` — `commitInline` only commits when `git_commits === true`

## Assumptions

### Initial (from elaboration)
- [low] Steps are renumbered cleanly (1–18) rather than lettered to keep HISTORY at "step 11"; all external citations are updated instead. **Why:** a top-to-bottom reader of the new order is the primary audience, and the citation set is small and fully enumerated (CLAUDE.md ×5, plan-cleanup ×5).
- [low] Target-branch resolution and the plans-branch / base-missing guards move up to a new step 3.5 (before debug cleanup), so a doomed merge stops before any code is edited and step 7's diff reuses the single resolution. **Why:** the question text names `[target-branch]`; there is no point asking before the guards pass. Guard text and conditions are unchanged.
- [low] "Merge and delete" branch deletion moves after the kept-worktree teardown. **Why:** git refuses to delete a branch checked out in a linked worktree; the task constraint only requires deletion after a successful merge, which still holds.
- [low] Inline storage mode: the completion record is no longer swept into the pre-merge code commit (it doesn't exist yet at that point); it is committed by the step-17 helper (only when `git_commits` is true). CLAUDE.md's "code-commit paths" note is updated to say so. **Why:** the reorder makes the old sweep impossible; the helper path is the documented contract for `.plans` commits.
- [low] plan-reopen is fixed too, even though its late question does not gate the edits. **Why:** the task asks to fix skills with "the same pattern"; moving the question first costs nothing and satisfies the new invariant.
- [low] Reinstall is deferred until after merge: `~/.claude/skills/*` are dev symlinks into the main checkout, so running `node bin/dev.js` from the execution worktree would repoint them at a directory that is deleted at finish. **Why:** observed `ls -la ~/.claude/skills/plan-complete` → symlink to the main repo.
- [high] Pre-existing kept-worktree hazards (step 7/9 commit in the main checkout rather than the kept worktree; `branch -d` when the main checkout is on the task branch) are reported, not fixed. **Why:** out of scope for an ordering fix.

### Discovered during execution
- [low] The new invariant became Critical Requirement 2, directly after rule 1. The old rules 2/3 (output format, no hallucinated commands) were renumbered to 3/4. **Why:** the segment allowed either placement as long as the rule sat next to "Branch merge requires interactive prompt". Nothing outside the file cites these rule numbers.
- [low] The invariant's list of questions also names step 2's task-selection prompt and step 3's never-started confirmation, alongside the prompts the brief listed. **Why:** both are interactive and both come before step 12. Leaving them out would make the "every question" list incomplete.
- [low] A `git branch -d` failure in step 11b is a warning, and completion continues. **Why:** by step 11b the merge has already landed. Stopping there would leave a task that is merged but not archived, which is the class of half-done state this task removes. Previously the delete ran after archiving, so a failure there was never fatal to completion either.
- [low] Step 8 now has an explicit cancel/no-answer STOP that never picks a default option. **Why:** this is the headless case from rota #078. The run must exit cleanly with the task still re-runnable, and must not guess a merge choice.
- [low] Step 9's pre-merge code commit still runs when the choice is "Skip merge". **Why:** the old step 13 ran before the question no matter what the answer was, so this keeps the earlier behaviour.
- [low] Every refusal path in step 10 prints its own copy of the "Nothing was archived" block: Case A exit-128, Case B, Case C (after the unchanged verbatim block) and Case D conflict. A lead-in paragraph also states the rule once for the whole step. **Why:** the brief asked for the line after each refusal, and a copy at each site cannot be missed when an agent reads only the case it hit.
- [low] Step 3.5's "skip" when there is no `**Branch:**` field also says steps 8–11 are skipped. Step 8 still carries its own "skip to step 12" check. **Why:** each step keeps its own branch check, as the old steps 13 and 14 did, so a reader who jumps straight to step 8 still sees the routing.
- [low] plan-cleanup line 106 ("the shape `plan-complete` step 12 forbids") was renumbered to 16, not 15. **Why:** it refers to the PROGRESS.md "do not add a detect >5 then backfill branch" warning, which now lives in step 16 (Update PROGRESS.md).
- [low] plan-cleanup line 163 still says "plan-complete step 11". **Why:** it is sample output that quotes a historical HISTORY.md summary (task #018), not a live cross-reference. Rewriting it would falsify the quoted record.
- [low] CLAUDE.md gets the decide → merge → archive sentence in the Task Lifecycle paragraph only, right after the A/B/C/D dispatch sentence. The Resolve-target-branch bullet is left alone. **Why:** the brief preferred the lifecycle paragraph, and saying it once avoids two copies that could drift.
- [low] plan-delete: the branch question became step 6b, asked right after the yes/no confirmation. The deletion is applied in a new step 9b, after PROGRESS and HISTORY are updated and before the commit. Old 7c was removed, and a failing `git branch -D` warns and continues. A dismissed branch question cancels the delete with no changes made. **Why:** if the delete fails after the plan-state edits, plan state is already consistent. Cancelling on a dismissed question matches the existing "User cancels" behaviour, where no changes are made.
- [low] plan-reopen: the branch question became step 5b, before step 6's task-file edit as well as the step-7 move. Step 10 now only applies `branch_choice`, and a failed checkout warns and continues. **Why:** step 6 is already a `.plans/` write, so asking before it is the stricter form of "before the move" and costs nothing.

## Changes
- **Hypothesis confirmed (step 1):** in the original SKILL.md the first `.plans/` write was step 8 (L200); every merge-related STOP (plans-branch guard L259, base-missing L264, "Merge branch" AskUserQuestion L269, Case A exit-128 L299, Case B L305, Case C L310, Case D conflict L325) came after it. Also confirmed: no-branch tasks skipped to step 16 (missing the step-15 commit), and `git branch -d` ran before 14b removed the kept worktree.
- `skills/plan-complete/SKILL.md` restructured to decide → merge → archive. Old→new: 14 target/guards → 3.5; 14 question → 8 (`merge_choice`); 13 → 9; 14 dispatch → 10; 14b → 11a; branch delete → 11b (after teardown); 8–12 → 12–16; 15 → 17; 16 → 18. New Critical Requirement 2 ("No question after the task leaves pending/"). Every STOP before step 12 says "Nothing was archived … re-run /plan-complete NNN". No-branch tasks route to step 12 and so reach the step-17 commit. Command blocks, Merge-branch labels, BLOCKED texts, Case C block, teardown sequence and confirmation format unchanged.
- `CLAUDE.md`: plan-complete step citations updated (HISTORY append path 11→15 ×2, plans-branch hard-stop 14→3.5 ×2, inline code-commit sweep 13→9 plus a note that the completion record is now committed only by the step-17 helper); Task Lifecycle paragraph states decide → merge → archive.
- `skills/plan-cleanup/SKILL.md`: step 11→15 (×3), step 12→16 (×2); line 163 left as a historical quote.
- `skills/plan-delete/SKILL.md`: "Delete branch?" question moved to new step 6b (before the file is deleted); branch deletion applied in new step 9b after PROGRESS/HISTORY, warn-and-continue on failure; dismissing the question cancels with no changes.
- `skills/plan-reopen/SKILL.md`: "Checkout branch?" question moved to new step 5b (before the first `.plans/` write); step 10 applies the stored choice, warn-and-continue on failure.
- Audit: plan-backlog, plan-restore, plan-review, plan-execute 11.5, plan-pause, plan-combine not affected. Minor, unfixed: plan-review 3.4 writes `- Verification: every AskUserQuestion in plan-complete is above step 12 (L382); plan-delete/plan-reopen questions precede their first write; no stale step citations; `npm test` 144/144 passed.
- Reinstall: NOT run from the worktree — `~/.claude/skills/*` are dev symlinks into the main checkout, so the change goes live when the branch is merged to main (`node bin/dev.js` from main is optional).

## Notes
_Additional context_
