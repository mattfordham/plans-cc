# Add Interactive Discovery Loop To des-author

**ID:** 018
**Created:** 2026-06-19T00:00
**Type:** feature
**Status:** completed
**Branch:** feature/018-add-interactive-discovery-loop-to-des
**Completed:** 2026-06-19T00:00

## What
Add an interactive discovery loop to /des-author. On no-arg invocation, the skill should first survey the connected Figma file (big-picture screenshots + metadata), form a broad hypothesis classifying frames into style-guide frames vs. actual page frames, and recognize that the design "system" (especially composition) is embedded across many example page designs rather than explicitly drawn. It then validates that read with the user via per-area checkpoints — walking tokens → components → composition → layout, pausing to confirm the hypothesis for each area before authoring that area's file. When it needs a specific frame to resolve an inference (composition is the key example, since it's never separately defined in Figma), it auto-picks representative page frames from get_metadata first, and falls back to asking the user to supply/select specific Figma frame/node references when its own pick is insufficient. Scoped/refresh args may skip or shorten the upfront loop; bare no-arg gets the full guided experience. Preserve the existing "Needs confirmation" mechanism and the Step 7 hard stop for human review.

## Why
Real-world Figma files rarely contain a tidy, explicit design system. They mix a handful of style-guide frames with many page designs, and the actual *system* — especially composition — is only inferable across those page examples, never drawn in one place. Today `/des-author` (no-arg) authors end-to-end and only surfaces uncertainty after the fact under "Needs confirmation," so a wrong big-picture read (e.g. mistaking a page frame for a style guide, or guessing composition rules) silently propagates into all four output files before the human ever sees it. Front-loading an interactive discovery loop — survey, hypothesize, validate per area — catches a bad read at the cheapest possible moment and pulls the user's knowledge in exactly where Figma is silent, producing a more accurate reviewed source of truth with less rework.

## How Summary
Insert a new interactive **Step 2 (Survey & hypothesize)** into `des-author/SKILL.md`, immediately after the existing Figma-input step, that uses big-picture screenshots + `get_metadata` to classify frames into style-guide vs. page frames and floats a broad system hypothesis for the user to validate. Then add a lightweight **per-area validation checkpoint** to the front of each of the four authoring steps (tokens → components → composition → layout), so the user confirms the hypothesis for that area before its file is authored. The composition step additionally gets the **auto-pick-then-ask frame-reference** behavior (pick representative page frames from metadata; fall back to asking the user for specific frame/node refs). Scoped/`refresh` args shorten the loop to a single quick classify-confirm; only bare no-arg gets the full per-area walk. The existing "Needs confirmation" mechanism and the hard STOP-for-review step are preserved (renumbered).

**Files of note:**
- `skills/des-author/SKILL.md` — sole file changed: add Step 2, add per-area checkpoints to the authoring steps, add frame-ref fallback to composition, document the scope/refresh shortcut, renumber Steps 3–9.

## How
- [x] Step 1: Add a new **Step 2 "Survey & hypothesize (style-guide vs. page frames)"** after the current Step 1. It pulls big-picture `get_screenshot` captures + `get_metadata`, forms a broad hypothesis classifying frames (style-guide vs. page), explicitly notes that the system — especially composition — is inferred across page frames, and presents that classification + hypothesis to the user via `AskUserQuestion` for validation/correction before authoring begins.
- [x] Step 2: Renumber the existing authoring/stop/marker steps (current 2–8 become 3–9) and verify all internal step cross-references still resolve.
- [x] Step 3: Add a short **per-area validation checkpoint** to the front of each authoring step — tokens, components, composition, layout — that restates the relevant slice of the hypothesis and confirms (or adjusts) it with the user before that file is written.
- [x] Step 4: In the composition step, add the **auto-pick-then-ask frame-reference** behavior: auto-select representative page frames from `get_metadata` to ground inferred composition rules, and fall back to asking the user to supply/select specific Figma frame/node references when the auto-pick is insufficient; anything still unresolved continues to flow to "Needs confirmation."
- [x] Step 5: Document the **scope/refresh shortcut** in both the relevant step(s) and the Arguments section: bare no-arg = full survey + all four per-area checkpoints; a scope phrase or `refresh` = a single quick classify-confirm gate instead of the full walk.
- [x] Step 6: Verify the preserved invariants survive the edit — the "Needs confirmation" mechanism is intact across all areas, and the hard **STOP for human review** step still gates any code generation — and update the Edge Cases section to cover the new survey/checkpoint flow.

## Verification
Manual dry-run + structural check (skills are declarative markdown, no automated tests):
1. Re-read `skills/des-author/SKILL.md` end-to-end after the edit.
2. Confirm all of: the new Step 2 survey/classify/hypothesis; a per-area checkpoint at the front of each of the four authoring steps; the composition auto-pick→ask-fallback for frame refs; the scope/refresh single-gate shortcut documented in steps + Arguments; the "Needs confirmation" mechanism preserved across areas; the hard STOP-for-review step still present and gating code gen; steps renumbered with no dangling cross-references.
3. Narrate a no-arg dry-run walkthrough to confirm the survey → hypothesis → per-area-checkpoint → author → STOP conversation flows sensibly and reads coherently.

## Impact Scope
_Single file (`skills/des-author/SKILL.md`) — Impact Scope section not required (threshold is 3+ files)._

## Assumptions

### Initial (from elaboration)
_To be filled during elaboration_

### Discovered during execution
- [high] Used `AskUserQuestion` for both the new Step 2 survey gate and each per-area checkpoint. **Why:** The task explicitly named `AskUserQuestion` for these gates and it is already in `allowed-tools`; consistent with how the skill already validates interactively.
- [low] Phrased each per-area checkpoint as a single lead bullet titled **"Checkpoint first."** at the top of each authoring step, rather than a multi-bullet block. **Why:** The segment asked to keep checkpoints compact and additive in front of existing bullets; one dense lead bullet preserves all original guidance untouched and matches the bullet-list voice of surrounding steps.
- [low] Made each checkpoint reference "the broad hypothesis (Step 2)" explicitly by step number. **Why:** Ties the per-area gates back to the single survey hypothesis so the loop reads as one coherent discovery flow; step number is stable within this segment (renumber done in same pass).
- [high] Placed the survey step's hypothesis-presentation `AskUserQuestion` as the final bullet of new Step 2, gating before any authoring. **Why:** The step must validate BEFORE authoring begins; ordering it last in the step makes the gate the hand-off into Step 3+.
- [low] Phrased the composition frame-ref behavior as a single lead bullet titled **"Ground each inferred rule in real frames (auto-pick, then ask)."** placed right after the "Checkpoint first." bullet, using an (a)/(b)/(c) structure for auto-pick → ask-fallback → Needs-confirmation. **Why:** The segment asked to integrate it near the top after the checkpoint and before/around the Needs-confirmation guidance; one structured bullet keeps the three sub-behaviors together and preserves all existing bullets untouched. Named `get_design_context`/`get_screenshot` as the inspection tools since they are already in `allowed-tools`.
- [low] Documented the scope/`refresh` shortcut as a **"Loop length."** bullet in three coherent places: the Arguments list, the end of Step 2, and an Edge Cases bullet — each phrased to agree on "single quick classify-confirm gate" vs. "full per-area walk." **Why:** Task asked for Arguments + relevant step(s) to agree; repeating the same terms keeps them consistent and discoverable from each location.
- [high] Confirmed the two preserved invariants survived untouched rather than re-adding them: `## Needs confirmation` is referenced in Step 6 (incl. the new frame-ref bullet routing unresolved items there) and Step 7; Step 8 "Summarize and STOP for review" still gates code gen. **Why:** Step 6 of the segment said confirm, do not re-add if present — both were intact.
- [low] Added three new Edge Cases bullets (Step 2 contradiction → re-survey; scope/refresh collapse; auto-pick insufficient → ask for refs) in the same terse style, inserted after the existing `design-system/` bullet and before the reflow bullets. **Why:** Groups the new survey/checkpoint-flow edge cases together while leaving the original reflow/sparse-variable bullets in place and ordered last.

## Changes
All edits to `skills/des-author/SKILL.md` (single file):
- Added new **Step 2 "Survey & hypothesize (style-guide vs. page frames)"** — big-picture `get_screenshot` + `get_metadata`, classify frames into style-guide vs. page buckets, note the system (esp. composition) is inferred across page frames, state a broad hypothesis, and gate via `AskUserQuestion` before any authoring.
- Renumbered the former Steps 2–8 → 3–9; cross-references resolve.
- Added a `**Checkpoint first.**` lead bullet to each of the four authoring steps (4 tokens, 5 components, 6 composition, 7 layout) restating the relevant hypothesis slice and confirming via `AskUserQuestion` before writing.
- Added composition (Step 6) **"Ground each inferred rule in real frames (auto-pick, then ask)"** behavior: (a) auto-select representative page frames from `get_metadata`, (b) fall back to asking the user for specific frame/node refs, (c) anything unresolved flows to `## Needs confirmation`.
- Documented the **scope/`refresh` shortcut** in three places (Arguments, Step 2, Edge Cases): bare no-arg = full survey + four per-area checkpoints; scope phrase or `refresh` = a single quick classify-confirm gate.
- Verified preserved invariants (the `## Needs confirmation` mechanism and the hard STOP-for-review step) survived; added three Edge Cases bullets (user contradicts hypothesis → re-survey; scope/refresh collapse; auto-pick insufficient → ask user).

## Notes
Design decisions captured up front (from clarifying Q&A with user):
- **Trigger:** Default for no-arg. Bare `/des-author` always begins with the survey→hypothesis→validate conversation, then authors. Scoped/`refresh` args may skip or shorten the upfront loop.
- **Loop depth:** Per-area checkpoints. Walk tokens → components → composition → layout, pausing to validate the hypothesis for each area before authoring that file.
- **Frame refs:** Both, in order. Auto-pick representative page frames from `get_metadata` first; fall back to asking the user to supply/select specific Figma frame/node references when the auto-pick is insufficient.
- Motivating context: real Figma files mix a few style-guide frames with many page frames; the system (esp. composition) is inferred across many example pages rather than drawn explicitly.
