# Clear Test Instructions at End of Execute and Review Skills

**ID:** 011
**Created:** 2026-05-26T19:27
**Type:** feature
**Status:** completed
**Completed:** 2026-05-26T19:27
**Branch:** feature/011-clear-test-instructions-at-end-of-execute-review

## What
At the conclusion of the execute and review skills, finish with clear and succinct instructions on how to test/verify. The end-of-output should be optimized for a user returning to the tab after a long break with no fresh context. The very last line of output is the status marker (already standardized). Immediately above it should be a brief, very clear "how to verify" block so it's visible without scrolling.

## Why
Users frequently return to long-running Claude Code tabs after context-switching (lunch, meetings, next day). The current end-of-output is dense — `/plan-execute` worktree finish prints a summary block and the marker, but doesn't tell the user what to *do* to verify the change works. `/plan-review` prints "Test the changes, then..." but the verification criteria and next-step options are intermixed in a way that's easy to skim past. A short, dedicated "How to verify" block placed right above the status marker leverages terminal scrollback locality: the marker is always last, so whatever sits just above it is the most likely thing the user reads first on return.

## How
- [x] Step 1: Audit current end-of-output in `plan-execute` skill (worktree finish at section 11.e — both single-repo and multi-repo paths print a fixed block ending with the 🟢 marker)
- [x] Step 2: Audit current end-of-output in `plan-review` skill (section 9.b — renders summary then "You're now on branch..." footer ending with the 🟡 marker)
- [x] Step 3: Edit `plan-execute` SKILL.md section 11.e single-repo worktree finish (step 7): replace the fixed completion block with a new format that puts a brief "How to verify" block immediately above the marker. Format: completion summary → blank line → `**How to verify:**` block (2-4 bullets pulled from the task's Verification section, or a sensible default like "Run the affected feature manually and confirm it behaves as expected") → blank line → `**Next:** /plan-review NNN` → marker line.
- [x] Step 4: Apply the same edit to `plan-execute` SKILL.md section 11.e multi-repo worktree finish (step 7).
- [x] Step 5: Apply the same end-of-output pattern to `plan-execute` SKILL.md section 11.d (non-worktree completion summary in single-task mode).
- [x] Step 6: Edit `plan-review` SKILL.md section 9.b: restructure the footer so it ends with `**How to verify:**` (bullets from Verification section) → `**Next:**` (one most-likely action: `/plan-complete NNN`) → marker. Move the secondary action list (continue working, pause, reopen) up into a less prominent position or trim to the single most relevant.
- [x] Step 7: Update CLAUDE.md "End-of-Action Markers" section to document the new convention: marker stays last; "How to verify" + "Next" sit immediately above it; assume the reader has zero fresh context.
- [x] Step 8: 👁 Run `/plan-execute` and `/plan-review` on a test task (or read back the edited skill files) and verify the new end-of-output reads well from a cold-context perspective. (deferred to /plan-review)

## Verification
- The very last line of `/plan-execute` worktree-finish output is still the 🟢 status marker.
- Immediately above the marker is a `**How to verify:**` block (2-4 bullets) and a `**Next:**` line.
- The same pattern applies to `/plan-review` output (with 🟡 marker and `/plan-complete` as the next step).
- A user returning cold to the tab can answer "what just happened, what do I do next, how do I check it works" by reading only the last ~6 lines.
- No regression: existing required content (branch name, worktree cleanup confirmation, yolo assumptions note) is still present, just reorganized.

## Impact Scope
- `~/.claude/skills/plan-execute/SKILL.md` (sections 11.d, 11.e)
- `~/.claude/skills/plan-review/SKILL.md` (section 9.b)
- `~/Work/Open Source/plans/skills/plan-execute/SKILL.md` (source of truth — installed copy mirrors this)
- `~/Work/Open Source/plans/skills/plan-review/SKILL.md` (source of truth)
- `~/Work/Open Source/plans/CLAUDE.md` (End-of-Action Markers section — document convention)

## Assumptions

### Initial (from elaboration)
- [high] The source of truth for skills lives in `skills/plan-*/SKILL.md` under this repo; `~/.claude/skills/` is the installed copy. **Why:** CLAUDE.md describes the installer copies skills there. Edits should land in the repo files; the installed copies update on next `npx plans-cc` or `node bin/dev.js`.
- [low] "How to verify" bullets should come from the task's Verification section when present, with a generic fallback when absent. **Why:** Verification is already authored for this purpose; reusing it avoids duplication. Fallback handles tasks with empty Verification.
- [low] For `/plan-review`, only `/plan-complete NNN` deserves the prominent "Next:" slot. **Why:** That's the modal next action after review; the secondary options (continue, pause, reopen) are edge cases.

### Discovered during execution
- [low] When Verification has 5+ items, instruction tells Claude to "pick the most concrete user-observable checks (prefer behavioral/UI checks the user can run now over abstract criteria)" rather than just first-4. **Why:** A user returning cold to a tab benefits more from "click the button and see X" than from "no regressions in module Y" — pick what's executable in 30 seconds.
- [high] Removed the "Total: X/Y steps completed" line in all three locations (11.d, 11.e single, 11.e multi). **Why:** Segment summaries already showed step-level progress in real time during execution; restating the total at the very end competes for the cold-return visibility slot above the marker. The new "Segments: N executed | Deviations: X" line in 11.d is more compact info-per-line.
- [low] Fallback bullet for worktree finish is `- Run /plan-review NNN and walk through the diff` (matches the **Next:** action). For non-worktree 11.d the fallback is `- Manually exercise the changes in this checkout`. **Why:** Worktree mode hands off to /plan-review for verification anyway; non-worktree leaves the user in a working checkout where manual exercise is the natural action.
- [low] For `/plan-review` section 9.b: removed the upper `## Verification Criteria` block from the summary (option b in segment prompt) rather than keeping both it and the new lower `**How to verify:**` block. **Why:** Duplicating the same content twice in one summary adds visual weight without adding info. The lower block is positioned for cold-return readers; the upper block's content still lives in the task file for anyone who wants the full spec. Net result: less noise, single source of "what to check" in the rendered review.
- [low] For `/plan-review` 9.b fallback bullet wording: chose `- Manually exercise the changes on this branch and confirm the verification criteria above hold`. **Why:** Mirrors segment 1's fallback style; references "this branch" since plan-review has just checked out the task's branch; "above" hints that the upper summary (Changes / Completed Steps) is the context for what to exercise.
- [low] For `/plan-review` 9.b, the secondary action list (continue, pause, reopen) was collapsed into a single italic `_Other options:_` line below `**Next:** /plan-complete NNN`. **Why:** The segment prompt asked for a "less prominent position or trim to the single most relevant" — keeping all three as discoverable but visually subordinate (single italic line, dot-separated) preserves backlink discoverability without competing with the modal next action.

## Changes
- Edited `skills/plan-execute/SKILL.md`:
  - Section 11.d (non-worktree completion summary): added `**How to verify:**` block and `**Next:**` line above the marker; collapsed Segments+Deviations into one line; dropped "Total: X/Y".
  - Section 11.e single-repo worktree finish (step 7): same restructuring; yolo line now sits BEFORE the verify block; condensed the post-marker explanatory paragraph to a single sentence.
  - Section 11.e multi-repo worktree finish (step 8): same as single-repo path, preserving the `Repos with changes:` line in the status block.
- Edited `skills/plan-review/SKILL.md`:
  - Section 9.b: removed `## Verification Criteria` from the rendered summary; restructured the footer to put `**How to verify:**` (rendered at runtime from task's Verification section with capped bullets and a fallback) and `**Next:** /plan-complete NNN to merge and archive` immediately above the marker; collapsed the four-item secondary action list into a single italic `_Other options:_` line. Added a runtime instruction block (matching segment 1's wording) describing how to populate the `**How to verify:**` bullets.
- Edited `CLAUDE.md`:
  - Appended a "Cold-return optimization" paragraph to the "End-of-Action Markers" section documenting the `**How to verify:**` + `**Next:**` convention for action-producing skills, and noting that read-only skills are exempt.

## Notes
_Additional context_
