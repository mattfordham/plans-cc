# Non-code output tasks prefix title with anticipated artifact

**ID:** 052
**Created:** 2026-10-20T00:00
**Type:** feature
**Status:** completed
**Completed:** 2026-10-20T12:00
**Branch:** feature/052-non-code-output-title-prefix

## What
When a plan calls for non-code output, such as documentation/research/brainstorming/etc, the plan's title should begin with the anticipated artifact, for example: "Research: pricing comparions", or "Brainstorm: alternative visualization approaches".

## Why
Adds value by making a task's deliverable obvious at a glance in every list and dashboard view. A title like "Research: pricing comparisons" immediately signals the output is a document, not code, so reviewers set the right expectations and don't look for a diff to merge.

## How Summary
Introduce a single documented convention — the artifact title prefix for non-code deliverables — in `CLAUDE.md` next to the existing "Task Types" section, defining a small open vocabulary (`Research:`, `Brainstorm:`, `Doc:`, `Spec:`, `Analysis:`, `Plan:`, …) and the rule that a non-code task's `# ` title is prefixed with `<Artifact>: `. Then have each task-capturing skill reference that convention by name at its title-writing step (the same reference discipline `plan-pick` already uses for the type-keyword rules), so the vocabulary is defined once rather than copy-pasted. The prefix lives only in the title string — no new header field and no parser changes, since every title parser already reads the whole `# ` line verbatim.

**Files of note:**
- `CLAUDE.md` — the one place the convention is defined, under a new subsection beside "Task Types"
- `skills/plan-capture/SKILL.md` — primary capture skill; title written at step 6, type inferred at step 5
- `skills/plan-import/SKILL.md` — derives title + type when importing a markdown doc
- `skills/plan-mine/SKILL.md` — derives title from transcript/notes prose
- `skills/plan-pick/SKILL.md` — generates a title from a picked idea component
- `skills/plan-unpack/SKILL.md` — generates titles when expanding an idea into tasks
- `lib/parse-tasks.js` / `lib/render-progress.js` — confirmed to read the `# ` title generically (no change needed; verification only)

## How
- [x] Step 1: Add a new `### Non-code output tasks — artifact title prefix` subsection to `CLAUDE.md` immediately after the `### Task Types` section. Define the rule (prefix a non-code task's `# ` title with `<Artifact>: `), give the open vocabulary (`Research`, `Brainstorm`, `Doc`, `Spec`, `Analysis`, `Plan`, and "other artifact nouns as fits"), state that it is title-string only (no new header field, no `**Type:**` change), that detection is a weak heuristic on the *deliverable* not the subject matter ("fix the research page bug" is still a code task), and that `/plan-brainstorm` (which writes idea files, not tasks) is out of scope.
- [x] Step 2: Update `skills/plan-capture/SKILL.md` — after the "Infer task type" step (step 5) and before the title is written in "Write task file" (step 6), add a short sub-step that detects a non-code deliverable and prepends the artifact prefix to the title, referencing the CLAUDE.md convention by name rather than restating the vocabulary.
- [x] Step 3: Update `skills/plan-import/SKILL.md` at its title-derivation step (step 4) to apply the same referenced convention when writing the `# [Title]` heading.
- [x] Step 4: Update `skills/plan-mine/SKILL.md` and `skills/plan-pick/SKILL.md` title-generation steps to apply the same referenced convention.
- [x] Step 5: Update `skills/plan-unpack/SKILL.md` title-generation step to apply the same referenced convention; add a brief note to `skills/plan-combine/SKILL.md`'s auto-generated-title option to honor the convention (do not force it on a user-kept title).
- [x] Step 6: Confirm no title parser/renderer breaks on a prefixed title: re-read `lib/parse-tasks.js` and `lib/render-progress.js` to verify they read the whole `# ` line, and run the existing `node:test` suites for those two files (targeted: `node --test test/parse-tasks.test.js test/render-progress.test.js`) to confirm green.

## Verification
- `CLAUDE.md` has a single new subsection documenting the artifact-prefix convention, placed right after "Task Types".
- Each of plan-capture, plan-import, plan-mine, plan-pick, plan-unpack references the convention at its title-writing step; none re-inlines the vocabulary list.
- plan-combine honors the convention only for its auto-generated title option.
- `node --test test/parse-tasks.test.js test/render-progress.test.js` passes (prefixed titles don't break title parsing).
- A manual sanity check of the capture instructions would prefix e.g. "Research the pricing of competitors" → title "Research: pricing of competitors".

## Impact Scope

### Files to Modify
- [x] `CLAUDE.md` — add the `### Non-code output tasks — artifact title prefix` convention subsection
- [x] `skills/plan-capture/SKILL.md` — add the detection/prefix sub-step at the title-writing path
- [x] `skills/plan-import/SKILL.md` — reference the convention at title derivation (step 4)
- [x] `skills/plan-mine/SKILL.md` — reference the convention at title generation
- [x] `skills/plan-pick/SKILL.md` — reference the convention at title generation
- [x] `skills/plan-unpack/SKILL.md` — reference the convention at title generation
- [x] `skills/plan-combine/SKILL.md` — honor the convention for the auto-generated title option only

### Related Files (may need updates)
- `lib/parse-tasks.js` — read-only verification that the `# ` title is parsed generically (no change expected)
- `lib/render-progress.js` — same read-only verification

### Endpoints/UI Affected
- None (markdown skill docs + one convention block; the prefix renders as part of the existing title everywhere)

## Assumptions

### Initial (from elaboration)
- [low] Vocabulary is a small OPEN list (`Research`, `Brainstorm`, `Doc`, `Spec`, `Analysis`, `Plan`, plus other artifact nouns), not a closed enum. **Why:** the task description says "documentation/research/brainstorming/etc" — the "etc" signals the examples are illustrative, not exhaustive.
- [low] Apply the convention across the task-capturing skills that derive a title (capture, import, mine, pick, unpack), and reference it (not force it) from plan-combine's auto-title option; exclude plan-brainstorm. **Why:** research found these five all derive a title + type at the same point, while plan-brainstorm writes idea files (no `**Type:**`, different artifact class) and plan-combine's title is user-chosen.
- [high] The prefix lives in the title string only — no new `**Artifact:**` header field and no new `**Type:**` enum value. **Why:** research confirmed both JS parsers (`parse-tasks.js`, `render-progress.js`) and all display skills read the whole `# ` heading generically, so a prefix needs zero parser changes; a new field/type would ripple into many type-branching consumers for a cosmetic titling convention.
- [high] Document the convention once in CLAUDE.md and reference it from each skill, rather than inlining the vocabulary in each. **Why:** the type-keyword list is already copy-pasted across 3 skills (the stated anti-pattern); mirroring the central-definition pattern used by How Summary / Diagnosis / Task Types avoids a fifth copy.

### Discovered during execution
- [low] In `plan-capture`, added the detection as a dedicated numbered sub-step `5.5` (between type inference at step 5 and title write at step 6) rather than folding it into step 6's title-derivation bullet. **Why:** the prompt allowed either; a sibling numbered step mirrors the existing "Infer task type" step and keeps detection visible rather than buried in the write step. Step 6's title heading was also annotated to point back to 5.5 so the written title reflects the prefix.
- [low] In `plan-import`, attached the convention reference to the **Title** bullet of step 4 (title derivation) and pointed it at the `# [Title]` heading written in step 7, rather than editing step 7's code block directly. **Why:** step 4 is where title text is derived; keeping the guidance there mirrors where Type inference already lives, and avoids restating vocabulary inside the write-time template.
- [low] Phrased the CLAUDE.md subsection's vocabulary as six illustrative prefixes plus "other artifact nouns as appropriate," matching the prompt's examples. **Why:** the prompt specified these exact common prefixes and that the list is illustrative not exhaustive; chose concise contract-voice wording consistent with surrounding sections.
- [low] In `plan-mine`, attached the convention reference to the **Title** bullet at the item-capture step (step 2, title-derivation point) and pointed it at the `# [Title]` heading written in the approved-tasks loop, rather than editing the loop's write step. **Why:** the title is derived at item-capture; keeping guidance where the title text is derived mirrors plan-import/plan-capture and avoids restating vocabulary at write time.
- [low] In `plan-pick`, attached the reference to the "Generate a clear, action-oriented title" bullet in step 7, matching the existing "same keyword rules as /plan-capture" referencing style that sits directly below it. **Why:** that is the title-generation point and the skill already references plan-capture there, so a sibling convention reference reads naturally.
- [low] In `plan-unpack`, attached the reference to the "Title (clear, action-oriented)" per-candidate bullet (step 5), pointing at the `# [Title]` heading. **Why:** that bullet is where each task candidate's title is determined, parallel to where Type is determined.
- [high] In `plan-combine`, scoped the prefix to the auto-generated title option ONLY (the "For auto-generated title" paragraph of step 7), explicitly stating a user-kept title is never forced. **Why:** the prompt required honored-not-forced; a user who keeps the first task's title has made a deliberate choice that the convention must not override.

## Changes

**New convention (defined once):**
- `CLAUDE.md` — added `### Non-code output tasks — artifact title prefix` subsection between `### Task Types` and `## Testing`. Documents: non-code deliverables prefix the `# ` title with `<Artifact>: ` (e.g. `# Research: pricing comparisons`); open illustrative vocabulary (`Research:`/`Brainstorm:`/`Doc:`/`Spec:`/`Analysis:`/`Plan:`/…); title-string-only (no `**Artifact:**` field, no `**Type:**` change, zero parser changes); detection is a weak heuristic on the deliverable, not subject matter; scope = capture/import/mine/pick/unpack + honored-not-forced by plan-combine; plan-brainstorm out of scope.

**Skills updated to reference the convention by name (no vocabulary inlined):**
- `skills/plan-capture/SKILL.md` — added sub-step 5.5 ("Infer non-code artifact title prefix") after type inference (step 5); annotated step 6's title heading to reflect the possible prefix.
- `skills/plan-import/SKILL.md` — added the convention reference to step 4's Title bullet (title derivation), applied to the `# [Title]` heading written in step 7.
- `skills/plan-mine/SKILL.md` — added the reference to the step-2 Title bullet (item-capture title derivation), applied to the `# [Title]` heading in the approved-tasks loop.
- `skills/plan-pick/SKILL.md` — added the reference to the "action-oriented title" bullet in step 7, beside the existing "same keyword rules as /plan-capture" reference.
- `skills/plan-unpack/SKILL.md` — added the reference to the per-candidate "Title" bullet (step 5).
- `skills/plan-combine/SKILL.md` — added a brief note scoping the prefix to the auto-generated title option ONLY (never forced onto a user-kept title).

**Verification (read-only, no change needed):**
- `lib/parse-tasks.js:21-22` reads the title as everything after `# ` (`line.slice(2).trim()`); `lib/render-progress.js:50` captures the whole heading via `/^# (.+)$/m`. Both carry a prefixed title through intact — confirming the title-string-only approach needs zero parser changes.

**Tests:** `node --test test/parse-tasks.test.js test/render-progress.test.js` → 12/12 pass (branch/SHA unchanged across the run).

## Notes
Detection of "non-code deliverable" is inherently a weak heuristic — it keys on the deliverable (a document/analysis/plan), not on subject-matter keywords, so a code task that happens to mention "research" is NOT prefixed. This task itself edits skill markdown (a system change), so it keeps its plain `feature` title — it is not a non-code *deliverable* in the sense the convention targets.
