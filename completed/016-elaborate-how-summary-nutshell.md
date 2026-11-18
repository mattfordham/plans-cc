# Update Elaborate Skill With A "How" Summary Nutshell

**ID:** 016
**Created:** 2026-06-14T00:00
**Type:** chore
**Status:** completed
**Completed:** 2026-06-15T00:00
**Branch:** chore/016-elaborate-how-summary-nutshell

## What
Update the elaborate skill so there is a clearly defined "how" summary below the "why"... and above the current "how" details. I want an easy to scan technical "in a nutshell" with clearly indicated files of note.

## Why
Elaborated task files currently jump straight from **Why** (the rationale) into **How** (a long checkbox list of steps). There is no quick, scannable technical overview of the chosen approach, and no consolidated list of the key files involved. Adding a `## How Summary` section between Why and How gives a reader an "in a nutshell" view — the approach in 1-3 sentences plus a bulleted "Files of note" list — so they can grasp the shape of the work and where it lands without parsing every checkbox. This improves the readability of every elaborated task and the `/plan-show` detail view.

## How Summary

**In a nutshell:** Add a new `## How Summary` section to the task-file template (between `## Why` and `## How`), teach `/plan-elaborate` to generate it (a short technical overview + a "Files of note" bullet list derived from the How steps / research), make `/plan-show` render it, and document the new section in `CLAUDE.md`. The section is purely additive — no existing section is removed or reordered except to slot the new one in.

**Files of note:**
- `skills/plan-capture/SKILL.md` — canonical task-file template (step 6); add the new section here so every captured task carries the placeholder.
- `skills/plan-elaborate/SKILL.md` — generation logic (Paths A/B/C + step 14 file write); add instructions to author the How Summary.
- `skills/plan-show/SKILL.md` — detail renderer; display the new section after Why and before the How/Progress steps.
- `CLAUDE.md` — project conventions; document the new section in the task-template description.

## How
- [x] Step 1: In `skills/plan-capture/SKILL.md` step 6 template, insert a `## How Summary` section between `## Why` and `## How`, with placeholder body `_To be filled during elaboration_` and a one-line comment describing its purpose (technical "in a nutshell" overview + "Files of note" list).
- [x] Step 2: In `skills/plan-elaborate/SKILL.md`, add a dedicated subsection (and an Execution Contract / step reference) defining the How Summary format: a 1-3 sentence technical overview line plus a bulleted **Files of note** list derived from the How-step file paths and research "Relevant Files". State that the list is auto-derived (not a separate user prompt) and should stay in sync with the How steps.
- [x] Step 3: Wire How Summary generation into Path A (auto-generate after the How checkboxes), Path B (generate after the agreed approach; skip-mode auto-accepts), and Path C (regenerate/refresh when How steps change), and ensure step 14 writes the section between Why and How in the task file.
- [x] Step 4: In `skills/plan-show/SKILL.md`, render the `## How Summary` section in the detail view, positioned after Why and before the How/Progress checkbox rendering, for elaborated/in-progress/review/completed statuses.
- [x] Step 5: Update `CLAUDE.md` to document the new `## How Summary` section in the task-file template / section description, noting its position (between Why and How) and purpose.
- [x] Step 6: Self-review the four edited files for internal consistency — section ordering matches everywhere, no dangling references to the old Why→How adjacency, and the new section name (`## How Summary`) is used identically across all files.

## Verification
- Open `skills/plan-capture/SKILL.md` and confirm the step-6 template now lists `## How Summary` directly between `## Why` and `## How`.
- Confirm `skills/plan-elaborate/SKILL.md` contains explicit instructions to author the How Summary (overview + Files of note) and that step 14 writes it in the correct position across Paths A/B/C.
- Confirm `skills/plan-show/SKILL.md` renders the How Summary after Why and before the steps/progress.
- Confirm `CLAUDE.md` documents the new section.
- Grep the four files for `How Summary` and verify the header is spelled/cased identically in each.

## Impact Scope

### Files to Modify
- [x] `skills/plan-capture/SKILL.md` — add `## How Summary` to the canonical template (step 6).
- [x] `skills/plan-elaborate/SKILL.md` — add generation instructions + wire into Paths A/B/C and step 14.
- [x] `skills/plan-show/SKILL.md` — render the new section in the detail view.
- [x] `CLAUDE.md` — document the new section in the task-template conventions.

### Related Files (may need updates)
- `skills/plan-clarify/SKILL.md` — reads/refines How/Why; should NOT auto-regenerate the summary (kept out of scope, noted to avoid noise).
- `skills/plan-list/SKILL.md`, `skills/plan-status/SKILL.md` — only show progress; no change needed.

### Endpoints/UI Affected
- `/plan-show <id>` output — now includes a How Summary block.
- Every newly captured/elaborated task file — now contains a How Summary section.

## Assumptions

### Initial (from elaboration)
- [low] Named the section `## How Summary` (vs `## Implementation Summary` / `## Approach Summary`). **Why:** Matches the user's own "how summary" wording and reads naturally between Why and How; research flagged this as a naming choice with no codebase precedent.
- [low] The "Files of note" list is auto-derived by elaboration from the How-step paths and research "Relevant Files", not collected via a separate user prompt. **Why:** Keeps it in sync with the steps and adds no friction (skip-mode runs unattended); research recommended deriving over asking.
- [low] The How Summary is always present in the template (mandatory placeholder), not conditional on file count or complexity. **Why:** Simpler and consistent; mirrors how Why/How/Verification are always present. Research open question favored this.
- [high] Scope limited to plan-capture (template), plan-elaborate (generation), plan-show (render), and CLAUDE.md (docs); plan-list/plan-status/plan-clarify left unchanged. **Why:** Research showed those skills only parse progress/checkboxes and do not render the Why/How prose, so they are unaffected by an additive section.
- [low] plan-clarify deliberately does NOT regenerate the How Summary when refining steps. **Why:** Research warned that auto-regen during clarification would be noise; the summary can be refreshed on the next elaboration pass instead.

### Discovered during execution
- [low] Placed the `### How Summary Generation` spec immediately after the Observation Step Tagging Rules subsection (inside step 11), rather than in the Execution Contract or a standalone step. **Why:** It is generation logic shared by all of Path A/B/C, so it belongs alongside the other shared How-generation rules under step 11; Paths A/B/C reference it by name.
- [low] Used `_To be filled during elaboration_` as the template placeholder with no HTML comment. **Why:** The segment prompt noted to match the neighboring italic-placeholder convention rather than add a comment that clashes with style; every adjacent section uses the bare italic line.
- [low] In Path B, made the interactive confirmation optional/lightweight ("you may show it for confirmation ... no separate question is required") rather than mandating an AskUserQuestion. **Why:** The summary is auto-derived from already-agreed material; an extra prompt would add friction inconsistent with the "no separate user prompt" rule.

## Changes
- `skills/plan-capture/SKILL.md` — Inserted a `## How Summary` section (placeholder `_To be filled during elaboration_`) between `## Why` and `## How` in the step-6 task-file template, so every captured task carries the section.
- `skills/plan-elaborate/SKILL.md` — Added a `### How Summary Generation` spec subsection under step 11 (after the Observation Step Tagging Rules) defining the format (1-3 sentence "in a nutshell" overview + auto-derived `**Files of note:**` bullet list, kept in sync with the How steps, no separate user prompt). Wired generation into Path A (auto-generate after the How checkboxes), Path B (generate after the agreed approach; skip-mode auto-accepts), and Path C (refresh when How steps change), and updated step 14 to write the section between Why and How.
- `skills/plan-show/SKILL.md` — Added How Summary parsing and rendering after Why and before the How/Progress checkboxes in the elaborated, in-progress, review, and completed status blocks; omits the section when empty/placeholder.
- `CLAUDE.md` — Added a `### How Summary Section` subsection documenting the new section's position (between Why and How), purpose (scan-friendly technical overview + Files of note), and lifecycle (seeded at capture, generated during elaboration, rendered by plan-show).
- Verification: grep across `skills/` + `CLAUDE.md` confirms `## How Summary` is spelled/cased identically in all four files; template ordering verified as Why → How Summary → How.

## Notes
The source-of-truth skill files live in this repo under `skills/`; the copies in `~/.claude/skills/` are installed by `bin/install.js`. All edits must target the repo `skills/` files. There is no automated test suite for skill behavior (skills are declarative markdown) — verification is by inspection/grep.
