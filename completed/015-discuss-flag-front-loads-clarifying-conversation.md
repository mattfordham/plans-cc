# Add a `discuss` Flag That Front-Loads a Clarifying Conversation

**ID:** 015
**Created:** 2026-06-09T00:00
**Type:** feature
**Status:** completed
**Branch:** feature/015-discuss-flag-front-loads-clarifying-conversation
**Completed:** 2026-06-10T00:00

## What
Add a `discuss` modifier flag that prepends a clarifying, options-first conversation onto an existing capture/elaborate/execute chain — rather than being its own command. It's a front-loaded gate, not a destination.

Two target entry points:

1. **`/plan-capture <description> discuss`** — capture the task, then hold an idea-level conversation ("here's what I think you're solving for — is that right? a few rough directions…"), and once aligned, chain into elaboration using what the discussion settled. The `discuss` flag implies `elaborate` at the end (like `execute` implies `elaborate`).

2. **`/plan-execute <description> yolo discuss`** — capture, then hold a clarifying conversation to confirm we're solving the right thing, THEN run the normal yolo process (worktree, skip-mode elaboration, autonomous execution). The discussion is a bounded upfront gate that ends before autonomy begins.

Motivation: there is currently no `capture → discuss` path. `/plan-discuss` refuses `pending` tasks (it requires an elaborated task with a How section). The existing two-step workaround is `/plan-elaborate <desc>` then `/plan-discuss <id>`, but that forces elaborate to *propose* a plan before any conversation — the inverse of "talk through options first, then commit to a plan."

## Why
Closes a real gap: capturing a loose, half-formed issue and talking through options BEFORE a plan is committed. Especially valuable for the yolo path, whose core risk is confidently building the wrong thing — a short intent-confirmation gate is the natural antidote (a couple minutes confirming intent, then let it run unattended).

## How
- [x] Step 1: Define the idea-level discussion gate as a small shared spec (a short block both `plan-capture` and `plan-execute` reference, rather than duplicating prose). Spec: runs ONLY after a fresh auto-capture (v1 scope — not on existing task IDs); opens with a compact pending-idea header (Title + What only, no Why/How/Verification to quote); converses open-endedly reusing `plan-discuss` steps 6 (turn-by-turn, options-first, AskUserQuestion for trade-offs, don't-just-agree) and 9 (exit signals: "go"/"done"/"proceed"); is EPHEMERAL — it writes nothing to the task file; the agreed direction is carried in-context into the elaborate step only. Done inline in the calling skill's session (NOT a spawned sub-agent — a sub-agent can't hold a live user back-and-forth).
- [x] Step 2: Add `discuss` parsing to `skills/plan-capture/SKILL.md` step 2. Recognize standalone trailing `discuss` (no `and/then/&` connector, mirroring how trailing `elaborate` works). `discuss` implies `auto_elaborate=true`. Add table rows so it composes with execute/go/branch/worktree (e.g. `discuss and go`, `discuss` alone). Update the `argument-hint`, Arguments prose, and Edge Cases.
- [x] Step 3: Insert the discussion gate into plan-capture's chain between step 11 (capture confirmation) and step 12 (auto-elaborate), guarded by `discuss_mode`. Per the Step 1 spec: converse, then on exit feed the agreed direction into the auto-elaborate step (still `skip_mode=true`) as starting context. Do NOT edit the task file in the gate. If `auto_execute` is also set, execution still follows elaborate as today.
- [x] Step 4: Add `discuss` parsing to `skills/plan-execute/SKILL.md` step 2 (after the worktree → yolo → branch → step-filter detection order; `discuss` is a per-token case-insensitive flag, stripped after match). Insert the gate inside step 3 between auto-capture and auto-elaborate. Guard: discuss only fires when `auto_capture` is true (v1). For `yolo discuss`, the gate runs first (open-ended, until "go"), THEN yolo's autonomy proceeds unchanged (worktree at step 11e, deferred observations). Add an Execution-Contract note that `yolo discuss` is intentionally NOT fully unattended — it pauses for the upfront gate.
- [x] Step 5: Update `CLAUDE.md` Shortcuts paragraph (under Task Lifecycle) and `skills/plan-help/SKILL.md` to document `discuss` on both entry points, the auto-capture-only v1 scope, and the `yolo discuss` "not unattended" caveat. Update the All Skills table row notes if needed.
- [x] Step 6: Manually walk both flows: `/plan-capture <desc> discuss` (capture → inline conversation → elaborate; file ends `elaborated`, nothing written by the gate) and `/plan-execute <desc> yolo discuss` (capture → conversation → autonomous worktree run ending in `review`). Confirm `discuss` composes with `branch`/`worktree` and that an existing-ID invocation (`/plan-execute 5 discuss`) does NOT trigger the gate (points user to `/plan-discuss 5`).

## Verification
Verify `/plan-capture <desc> discuss` captures, holds an open-ended conversation, and only elaborates once the user signals done — with the agreed direction reflected in the elaborated How. Verify `/plan-execute <desc> yolo discuss` runs the clarifying gate first, then the full autonomous yolo process. Verify `discuss` composes with existing `branch`/`worktree` keywords and that documentation matches behavior.

## Impact Scope

### Files to Modify
- [x] `skills/plan-capture/SKILL.md` — parse trailing `discuss` (implies elaborate), insert inline discussion gate before auto-elaborate
- [x] `skills/plan-execute/SKILL.md` — parse `discuss` flag, insert inline clarifying gate between auto-capture and auto-elaborate; document `yolo discuss` is not unattended
- [x] `CLAUDE.md` — document the flag in Task Lifecycle / Shortcuts
- [x] `skills/plan-help/SKILL.md` — add `discuss` to the command/keyword reference

### Related Files (may need updates)
- `skills/plan-discuss/SKILL.md` — source of the conversational engine reused inline (steps 6 + 9). NOT modified — decision was inline + ephemeral, so no `allow_pending` flag is needed; plan-discuss keeps rejecting bare pending tasks as before.

## Assumptions

### Initial (from elaboration)
_To be filled during elaboration_

### Discovered during execution
- [high] Authored the canonical gate spec as a self-contained block embedded verbatim into plan-capture (and to be embedded verbatim into plan-execute in a later segment), rather than pointing both skills at one canonical location. **Why:** Skills live in separate directories and cannot `include` a shared file at runtime; the Step 1 instructions explicitly endorse this approach as cleanest. The constraint "no duplicated divergent prose" is met by keeping the embedded block identical in both skills.
- [high] The gate block references plan-discuss step 6 (turn-by-turn / options-first / AskUserQuestion / don't-just-agree) AND step 8 (exit signals), not "step 9" as the task description states. **Why:** In the actual current `plan-discuss/SKILL.md`, the exit-signal detection ("done"/"exit"/"wrap up") lives in step 8; step 9 is the summarize-and-commit step. I extended the exit phrases to include "go"/"proceed" per the gate spec since those are the natural front-load exit words. Referencing the real step numbers keeps the cross-reference accurate.
- [low] Placed the gate as a new step 11.5 ("Clarifying discussion gate") between step 11 (capture confirmation) and step 12 (auto-elaborate), using a `.5` number to avoid renumbering the entire downstream chain (12, 13). **Why:** Minimal-diff insertion; the task description's references to "step 12 (auto-elaborate)" stay valid. An alternative would have been full renumbering, but that risks breaking other cross-references.
- [low] Trailing `discuss` is parsed with the same standalone-keyword treatment as trailing `elaborate` (no `and/then/&` connector required), and the combined `discuss (and/then/&)? (execute|go)` forms set auto_execute too. **Why:** Mirrors the existing trailing-`elaborate` precedent and the task's request that `discuss` compose with execute/go/branch/worktree.
- [high] In plan-execute, placed `discuss` detection AFTER step-filter detection (5th in parse order) and as a per-token case-insensitive flag (not an end-anchored phrase like plan-capture's). **Why:** Matches plan-execute's existing convention where worktree/yolo/branch/step-filter are all per-token strip-and-flag detections; the segment prompt specified "after the existing worktree → yolo → branch → step-filter detection order."
- [high] Inserted the clarifying gate inside step 3 at the existing "Then immediately auto-elaborate:" boundary, guarded by `discuss_mode` (which only matters when `auto_capture` is true since step 3 itself only runs under auto-capture). **Why:** That boundary is exactly the seam between the capture portion and the elaborate portion the segment prompt called out; the double-guard (`auto_capture` gating the whole step + `discuss_mode` gating the gate) satisfies the v1 scope (existing IDs never reach step 3).
- [low] Added the `yolo discuss` Execution-Contract note as a NEW numbered point #4 (right after the yolo definition #3), renumbering the old #4/#5 to #5/#6. **Why:** No existing cross-references point to Contract #4 or #5 (only #1, #2, #3 are referenced), so renumbering is safe and keeping the discuss caveat adjacent to the yolo definition reads best. Alternative (appending as #6) would have separated it from the related yolo point.
- [low] Left CLAUDE.md "All Skills" table rows unchanged; documented `discuss` only in the Shortcuts paragraph. **Why:** The task said update table rows "if needed — don't force it"; the terse row purposes already cover the skills' core function and the Shortcuts paragraph fully documents the new flag. Adding `discuss` to those rows would be redundant.
- [low] In plan-help, documented `discuss` as its own callout paragraph (mirroring the `yolo` keywords callout) plus two fast-track examples and an updated `/plan-capture` argument hint in the All Commands table. **Why:** Consistent with how `branch`/`worktree`/`yolo` are surfaced there (a keywords callout + examples); the table-row hint aids discoverability.

## Changes
- **`skills/plan-capture/SKILL.md`** (steps 1-3):
  - `argument-hint` now lists `discuss`.
  - Arguments prose documents the trailing `discuss` keyword (implies elaborate; composes with execute/go/branch/worktree).
  - Step 2 parse table gained 8 `discuss …` rows placed first (priority over bare execute/go/elaborate); no-match default now includes `discuss_mode=false`; an "Important"/bullet note explains the standalone-keyword behavior and priority.
  - New **step 11.5 "Clarifying discussion gate"** (guarded by `discuss_mode`) holds the canonical 5-point gate spec (scope guard, compact Title+What header, open-ended converse reusing plan-discuss step 6, exit-signal detection reusing plan-discuss step 8, carry-direction-in-context). Ephemeral — writes nothing.
  - Step 11 marker note and step 12 auto-elaborate updated to feed the gate's agreed direction into elaboration (skip_mode stays true).
  - Edge Cases extended for `discuss` (implies elaborate, needs no connector, composes with branch/worktree, only matches at END).
- **`skills/plan-execute/SKILL.md`** (step 4):
  - `argument-hint` lists `discuss`.
  - Parsing rules: `discuss` detection (per-token, case-insensitive, stripped) placed after worktree → yolo → branch → step-filter; mirrored in step 2.
  - Examples added (`discuss`, `yolo discuss`, `branch discuss`).
  - Canonical gate block embedded inside step 3 at the auto-capture → auto-elaborate seam, guarded by `auto_capture && discuss_mode`; agreed direction fed into elaborate (skip_mode stays true). `yolo discuss` runs the gate first, then full autonomy unchanged.
  - New **Execution Contract #4**: `yolo discuss` is intentionally NOT fully unattended (old #4/#5 renumbered to #5/#6; all `Contract #N` cross-refs verified consistent).
  - 3 Edge Cases added (auto-capture-only, `yolo discuss`, composes with branch/worktree).
  - **Verified:** gate block points 2-5 are byte-identical to plan-capture's; only point 1's parenthetical and the cross-reference line differ (by design).
- **`CLAUDE.md`** — Shortcuts paragraph extended to document `discuss` on both entry points, the v1 auto-capture-only scope, and the `yolo discuss` not-fully-unattended caveat.
- **`skills/plan-help/SKILL.md`** — added `discuss` to the `/plan-capture` argument-hint row, added two fast-track examples, and a dedicated "`discuss` keyword" callout.

**Step 6 (manual walkthrough):** Skipped by user — implementation trusted on the strength of automated consistency checks (gate-spec points 2-5 verified byte-identical between plan-capture and plan-execute; Execution-Contract `#N` cross-references verified consistent after renumbering; all 4 frontmatter argument-hints valid). The live `/plan-capture <desc> discuss` and `/plan-execute <desc> yolo discuss` walkthroughs remain available to run before `/plan-complete`.

## Notes
Design decisions settled in conversation (2026-06-09):
- Scope: both entry points (capture + execute/yolo).
- The yolo+discuss gate is OPEN-ENDED (full turn-by-turn until the user says "go"), not a bounded 1-3 exchange check. This means yolo+discuss is intentionally not fully unattended.
- `discuss` is a modifier, not a new command — it reuses /plan-discuss's engine rather than duplicating it, and runs BEFORE elaborate on the raw idea (so it sidesteps /plan-discuss's "must be elaborated" rule).

Decisions settled during elaboration (2026-06-09):
- **Ephemeral gate** — the discussion writes NOTHING to the task file. The agreed direction is carried in-context into the elaborate step only. (No What/Notes edits, no "Discussion Notes" section.) Rationale: cleanest separation — discuss shapes intent in-conversation, elaborate produces the durable structure.
- **Auto-capture only (v1)** — the gate fires only for freshly auto-captured ideas. An existing task id (`/plan-execute 5 discuss`) does NOT trigger it; users discuss existing tasks with the standalone `/plan-discuss 5`.
- **Inline, not sub-agent** — the conversation runs in the calling skill's own session. A spawned sub-agent can't hold a live turn-by-turn with the user, so inlining is the only thing that satisfies the open-ended requirement.
- **Consequence:** `skills/plan-discuss/SKILL.md` does NOT change — no `allow_pending` flag. The reused "engine" is just steps 6 (turn-by-turn) and 9 (exit signals), referenced inline.
- **Rejected research suggestion:** the research agent recommended erroring on `yolo + discuss` as "contradictory." We explicitly support that combination (gate first, then autonomy) — so this recommendation was discarded.
