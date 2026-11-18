# Cap HISTORY.md summary length and decide an archive strategy

**ID:** 029
**Created:** 2026-08-18T14:32
**Type:** refactor
**Status:** completed
**Completed:** 2026-08-18T15:12
**Branch:** refactor/029-cap-history-md-summary-length

## What
`.plans/HISTORY.md` grows without bound, and its rows have grown ~18x over a project's life. Observed in `~/work/multi-repo-app`: **900K across 556 lines**, worst single row **9,020 chars**.

| | avg row length |
|---|---|
| First 100 completions | 215 chars |
| Last 100 completions | 3,886 chars |

`/plan-complete` step 11 asks for a *"Brief summary from Changes section."* Early rows honored that; recent rows paste in near-complete postmortems — multi-paragraph root-cause narratives, disproved hypotheses, bolded caveats. That content is **already** stored in full in `.plans/completed/NNN-slug.md` (581 files in multi-repo-app), so HISTORY has drifted from being an *index* into a second, redundant *archive*.

Two changes, deliberately kept in one task because they interact — the right cap length depends on whether rows also get sharded:

1. **Enforce a length cap** on HISTORY summaries (~200-300 chars), with a pointer to `completed/NNN-slug.md` for the full story. Restores the index/archive split the early rows had.
2. **Decide the archive strategy** — if HISTORY should also get physically smaller, roll completed years into `.plans/history/2026.md`, leaving HISTORY.md as recent rows + links.

**Do not prune.** Deleting completed-work history trades an irreversible loss for a problem with a non-destructive fix, and `/plan-retrospect` mines HISTORY.md by name as a lesson corpus (`skills/plan-retrospect/SKILL.md:195`), so pruning would quietly degrade retrospectives. Append-only is the correct design; only the row *size* is wrong. Any sharding must keep retrospect able to walk the shards.

Both the cap and any sharding only affect *future* completions — a one-time backfill pass is needed to shrink the 552 existing fat rows.

## Why
Improves maintainability by restoring HISTORY.md to its intended role as a compact *index* rather than a redundant second *archive*. Uncapped "Brief summary" instructions let recent rows balloon ~18x (215 → 3,886 avg chars; one row 9,020 chars; 900K/556 lines in multi-repo-app), duplicating postmortem prose that already lives in full under `.plans/completed/NNN-slug.md`. A hard char cap plus a pointer to the full record keeps the history append-only (non-destructive, retrospect-safe) while making future growth linear-and-slow.

## How Summary
Mandate a one-sentence *shape* (`<verb-phrase> — <what changed>`) for the HISTORY.md Summary column in `plan-complete` step 11, backed by a ~250-char cap, appending a `→ completed/NNN-slug.md` pointer to the full postmortem instead of pasting it. The shape is the primary constraint (a template has nowhere to put a third paragraph; a char budget must be self-estimated) — step 16's already-terse "one sentence" confirmation block is the model. Update the `plan-init` template comment and confirmation wording to match, then document (only — execution is out of scope) a one-time manual backfill procedure (re-summarize the existing fat rows from their completed/ files) as a Notes-driven optional pass. **Sharding into `history/YYYY.md` is deliberately NOT adopted in v1** (see Assumptions) — the cap alone converts unbounded growth into ~250 chars/row, and sharding would make five skills shard-aware for marginal benefit. All changes are prose-level instructions in declarative SKILL.md files; no runtime code.

**Files of note:**
- `skills/plan-complete/SKILL.md` — step 11 (line ~208) is the sole write path where the cap + pointer is enforced; confirmation block (line ~361) mirrors the wording.
- `skills/plan-init/SKILL.md` — step 5 (line ~101) HISTORY.md template; add a header comment documenting the cap convention for new projects.
- `skills/plan-retrospect/SKILL.md` — consumer (line ~195); verified the cap costs it no signal (its rich prose is mined from `completed/*.md`, not HISTORY summaries) — no change needed, but re-checked.
- `CLAUDE.md` — the `.plans/` layout + cross-skill contracts; add a one-line note on the HISTORY summary cap convention.

## How
- [x] Step 1: In `skills/plan-complete/SKILL.md` step 11 (line ~208), replace the unbounded `[Brief summary from Changes section]` cell instruction with a mandated *shape* plus a cap: the Summary cell MUST be ONE sentence of the form `<verb-phrase> — <what changed>`, ≤250 chars, followed by a ` → completed/NNN-slug.md` pointer to the full record. Lead with the shape — a template the agent fills has nowhere to put a third paragraph, whereas a char budget it must self-estimate is the weaker constraint ("Brief" already failed 552 times) — and keep `≤250 chars` as the backstop and to match house style (`≤N chars`, cf. plan-clarify line 113). Include a worked example row. Explicitly forbid pasting multi-paragraph postmortems, root-cause narratives, or disproved hypotheses (those already live in the completed file).
- [x] Step 2: In `skills/plan-complete/SKILL.md`, align the confirmation output block (step 16, line ~361) with the new cap + pointer. Note it already says "one sentence from Changes section" and its example output is correctly terse — it is the *well-behaved* instruction the write path should have had, so align step 11 toward it rather than the reverse. Verify no other summary-echoing wording contradicts the cap.
- [x] Step 3: In `skills/plan-init/SKILL.md` step 5 (line ~101), add a short comment/note above or beside the HISTORY.md table template documenting the Summary-column convention (≤250 chars + pointer to `completed/NNN-slug.md`), so new projects inherit the contract.
- [x] Step 4: Re-verify (via Grep/Read, no code change unless a break is found) that the row-consuming skills still work with capped rows: `plan-reopen` (line ~109, removes by `| NNN |` first column — unaffected), `plan-delete` (line ~107, same), `plan-discuss` (line ~58, skim — only benefits), `plan-retrospect` (line ~195, mines `completed/*.md` for rich signal; HISTORY is only a completion-date source with the completed file as an equal fallback — unaffected). Confirm none parse the Summary cell for structured signal; if any does, note it and stop for review.
- [x] Step 5: Add a one-line note to `CLAUDE.md` (in the HISTORY.md / `.plans/` layout area) recording the HISTORY Summary cap convention (≤250 chars, pointer to the full completed file, append-only, no pruning) so it's a documented cross-skill contract.
- [x] Step 6: Fold the backfill procedure already drafted in Notes into its final documented form (the Notes block + the one-line CLAUDE.md convention note from Step 5): for each existing fat row, re-read `.plans/completed/NNN-slug.md`, regenerate a ≤250-char summary + ` → completed/NNN-slug.md` pointer, and rewrite that row in place. **Scope of this task is writing the procedure down only** — executing it against a consuming project (e.g. multi-repo-app's 552 rows) is explicitly OUT OF SCOPE and tracked separately, since this repo's verification cannot check another repo's data. Keep it a documented agent-driven pass, NOT a new skill (no migration-skill pattern exists to model one on). Emphasize non-destructive: same row count, same IDs/dates; only the Summary cell shrinks.

## Verification
- Re-read `skills/plan-complete/SKILL.md` step 11 and confirm the summary instruction now mandates the one-sentence shape `<verb-phrase> — <what changed>` with a worked example, states ≤250 chars as the backstop, requires a ` → completed/NNN-slug.md` pointer, and explicitly forbids pasting full postmortems / root-cause narratives / disproved hypotheses.
- Confirm the confirmation block (line ~361) and `plan-init` template wording are consistent with the new cap (no lingering "Brief summary" unbounded phrasing that contradicts the cap).
- `grep -rn "HISTORY.md" skills/` still lists all existing consumers; manually confirm none of reopen/delete/discuss/retrospect parse the Summary *cell* for structured data (they match the first `| NNN |` column or mine `completed/*.md`), so capping is behavior-preserving for them.
- Walk a mental (or scratch-project) completion: a new `/plan-complete` would append a short capped row with a pointer, and `/plan-retrospect` on that history still finds its signal in `completed/*.md`.
- `CLAUDE.md` documents the cap convention; the backfill procedure is written as an optional, clearly non-destructive, per-project pass (no new skill file created) and states that *running* it against a consuming project is out of scope for this task.

## Impact Scope

### Files to Modify
- [x] `skills/plan-complete/SKILL.md` — step 11 gains a ≤250-char cap + pointer; confirmation wording (line ~361) aligned.
- [x] `skills/plan-init/SKILL.md` — step 5 HISTORY.md template gains a documenting comment for the Summary-column convention.
- [x] `CLAUDE.md` — add a one-line HISTORY Summary cap convention note in the `.plans/` layout / contracts area.

### Related Files (may need updates)
- `skills/plan-retrospect/SKILL.md` — consumer; verified no change needed (mines `completed/*.md`), but re-checked in Step 4.
- `skills/plan-reopen/SKILL.md`, `skills/plan-delete/SKILL.md`, `skills/plan-discuss/SKILL.md` — row consumers; match first column only, unaffected — re-verified in Step 4.
- `skills/plan-help/SKILL.md` (line ~83) — describes HISTORY.md as "Completed work archive"; wording is still accurate under a cap (only cosmetic, likely no change).

### Endpoints/UI Affected
- `/plan-complete` output — future HISTORY.md rows become short (≤250 chars) with a `→ completed/NNN-slug.md` pointer instead of full postmortems.

## Assumptions

### Initial (from elaboration)
- [low] **Cap = 250 chars with a ` → completed/NNN-slug.md` pointer.** The task specified "~200-300 chars"; 250 is the round midpoint and matches the house `≤N chars` style (plan-clarify line 113, plan-import 50-char, plan-combine/capture 40-char). **Why:** research surfaced multiple `≤N chars` truncation conventions to mirror; picking one round number keeps the instruction unambiguous, and 250 sits centrally in the requested range.
- [low] **Sharding into `.plans/history/YYYY.md` is NOT adopted in v1 — cap only.** The open design question ("cap alone, or also shard?") is resolved toward cap-only. **Why:** research showed retrospect's rich signal is mined from `completed/*.md`, not HISTORY summaries, so the cap alone shrinks recent rows ~15x and makes growth linear; sharding would force five skills (retrospect corpus walk, reopen/delete row-removal, discuss/help/CLAUDE.md references) to become shard-aware for marginal size benefit — classic over-engineering flagged in Approach Warnings. Reversible later as a standalone follow-up if size ever becomes a real problem.
- [low] **Backfill is a documented, optional, per-project manual procedure — not a new skill or script.** **Why:** these are declarative SKILL.md files with no runtime code, and no migration/maintenance-skill pattern exists to model one on; a documented agent-driven pass keeps the change declarative and non-destructive, and the backfill only affects consuming projects (e.g. multi-repo-app), not the plans-cc repo.
- [high] **No pruning; history stays append-only.** **Why:** stated explicitly in the task What/Notes and reinforced by retrospect mining HISTORY.md by name — pruning would irreversibly degrade the lesson corpus. The fix targets row *size*, never row *count*.

### Resolved (discussion 2026-08-18)
- **The constraint is a mandated shape, not just a char count.** `≤250 chars` alone asks the agent to self-police at the exact moment it is holding a postmortem it just wrote and values. A fixed one-sentence template has nowhere to put the extra paragraphs. **Corroborating evidence:** step 16's confirmation block already says "one sentence from Changes section" and never drifted, while step 11's "Brief summary" drifted ~18x — the skill already contains the well-behaved instruction, just not on the write path. Both shape and cap are now specified (Steps 1-2).
- **The ` → completed/NNN-slug.md` pointer is kept** (challenged during discussion as derivable-from-ID redundancy). `.plans/completed/` has ID gaps — no `005` in this repo — so the slug is a *lookup*, not a derivation; resolving it once at write time is worth ~30 of the 250 chars, and buys a human reader a copy-pasteable path. Machines are unaffected either way: every consumer keys on the `| NNN |` first column.
- **Backfill execution is out of scope for #029** — documentation only (see Step 6). Steps 1-5 are prose edits in this repo, verifiable by re-reading; running the backfill against multi-repo-app's 552 rows / 581 completed files cannot be verified from here.

### Discovered during execution
- [low] Wrote the `≤250 chars` cap as covering the sentence **plus** the ` → completed/NNN-slug.md` pointer (not the sentence alone). **Why:** The observed pathology is total row width, so the budget the agent self-checks should be the thing that actually grows; the pointer is a fixed ~35-char tax that a sentence-only cap would silently exempt.
- [low] Placed the pointer *inside* the Summary table cell (after the sentence) rather than adding a sixth column. **Why:** The existing 5-column table is already written to disk in every live project; adding a column would break every historical row's alignment, whereas an in-cell pointer is backwards-compatible and matches the task's stated "keep the pointer" decision without a schema change.
- [high] Wrote the plan-init note as an HTML comment above the table rather than prose outside the fenced block. **Why:** The fenced block is written verbatim into the project's HISTORY.md, so the convention must live *in the generated file* to be inherited by new projects; an HTML comment is invisible in rendered markdown and survives appends.
- [low] Made only a clause-level edit to the step 16 confirmation (pointing at step 11's capped sentence, noting the pointer is omitted there). **Why:** The segment brief flagged step 16 as the already-well-behaved instruction; restating the full shape/cap rule there would duplicate the contract in two places that could drift apart.
- [high] Placed the CLAUDE.md convention note as a new `### HISTORY.md Summary cap (cross-skill contract)` section immediately after "File Structure Created by Skills". **Why:** The document already groups cross-skill contracts into headed `### ...(cross-skill contract)` sections (worktree hygiene, project-root discovery), and the layout block directly above is what annotates `HISTORY.md` — placing it there puts the contract where a reader looking at the `.plans/` layout will hit it.
- [low] Wrote the backfill procedure as a bolded lead-in paragraph *inside* that same section rather than its own `###` heading. **Why:** The backfill is a corollary of the cap, not an independent contract; a sibling heading would over-weight a one-time optional pass, while burying it elsewhere (README, a Notes-only home) would make a future reader unlikely to find it next to the rule that motivates it.
- [low] Wrote a short multi-paragraph section rather than the literal "one-line note" the task text asked for. **Why:** The segment brief permits a couple of lines "if that is what the surrounding style demands"; every neighbouring cross-skill contract in CLAUDE.md is a prose paragraph, and Step 6's backfill procedure had to land in the same place, so one line would have been stylistically out of place and unable to carry both payloads.
- [high] Step 4 required no code change — no consumer parses the Summary cell. **Why:** reopen/delete match the `| NNN |` first column, discuss skims the file as free prose, retrospect mines `completed/*.md` for rich signal and uses HISTORY.md only as a completion-date source with the completed file as an equal fallback; help/init/README references are layout-descriptive only.

## Changes

**`skills/plan-complete/SKILL.md`** (the sole write path)
- Step 11 now opens with "HISTORY.md is an **index**, not a second archive. The full record already lives in `.plans/completed/NNN-slug.md`."
- The row template carries the mandated shape inline: `| NNN | [Title] | [type] | [YYYY-MM-DD] | [<verb-phrase> — <what changed>.] → completed/NNN-slug.md |`
- The shape is stated as the primary constraint, with `≤250 chars` (sentence + pointer together) as the explicit backstop.
- Added an explicit prohibition on multi-paragraph postmortems, root-cause narratives, disproved hypotheses, bolded caveats, and file-by-file breakdowns.
- Added a worked example row (Summary cell measures 134 chars).
- Step 16's confirmation block got a minimal clause referencing step 11 as the single source (no restatement, so the two cannot drift). Its terse example output was already correct and left untouched. File swept — no lingering unbounded "Brief summary" wording remains.

**`skills/plan-init/SKILL.md`**
- Step 5's fenced HISTORY.md template gained a 3-line HTML comment above the table header documenting the Summary-column convention. It sits *inside* the fence so it is written into each new project's generated HISTORY.md and inherited automatically.

**`CLAUDE.md`**
- New `### HISTORY.md Summary cap (cross-skill contract)` section placed after the "File Structure Created by Skills" layout block (the block that annotates `HISTORY.md`), matching the document's existing cross-skill-contract pattern.
- Records: index-not-archive framing; the one-sentence shape + in-cell pointer + ≤250-char backstop; the ban on postmortem prose; append-only / never-pruned (with the retrospect-corpus rationale); plan-complete step 11 as the single source; and that row consumers key on the `| NNN |` first column so the cap is behavior-preserving.
- Backfill procedure documented as a bolded lead-in paragraph in the same section: optional, one-time, per-consuming-project, agent-driven (deliberately not a skill or script), non-destructive (same row count/IDs/dates/titles/types — only the Summary cell shrinks), safe to skip, with *execution* explicitly out of scope.

**Verification performed (Step 4, read-only — no changes made)**
- `plan-reopen:109` and `plan-delete:107` remove rows by `| NNN |` first-column match — unaffected.
- `plan-discuss:58` skims HISTORY.md as free prose — benefits from shorter rows.
- `plan-retrospect` mines all five of its signals (files-of-note, reopen churn, pause churn, assumption clusters, time proxy) from `completed/*.md`; its only HISTORY.md-specific read is the column-4 completion date, with completed-file archive metadata as an equal fallback — unaffected.
- `plan-help:83`, `plan-init:37`, `README.md:285` are layout listings; `plan-merge-reviews:125` is a do-not-touch prohibition. Nothing in `lib/`, `bin/`, `test/`, or `agents/` reads HISTORY.md.
- **Confirmed: no consumer parses the Summary cell for structured signal.**

**Noted, not changed:** `plan-retrospect:195` still calls HISTORY.md "the dense per-task completion summaries" — a stale adjective under the cap, but not a break (retrospect's actual reads are unaffected). Left alone per Step 4's "no code change unless a break is found" mandate; flagged for review.

## Notes
**Resolved (elaboration, skip mode):** the open question — *cap alone vs. also shard?* — is settled as **cap-only for v1** (see Assumptions). Research confirmed the cap plus backfill shrinks HISTORY.md enough on its own; year-sharding is deferred as unnecessary complexity that would make five skills shard-aware. Reversible later as a standalone follow-up if size becomes a real problem.

**Backfill procedure (one-time, optional, per consuming project):** run in the affected project (e.g. `~/work/multi-repo-app`), NOT in the plans-cc repo. For each fat HISTORY.md row: re-read `.plans/completed/NNN-slug.md`, regenerate a ≤250-char summary + ` → completed/NNN-slug.md` pointer, rewrite the row in place. Non-destructive: append-only history is preserved (same row count, same IDs/dates); only the Summary cell shrinks. Safe to skip — new cap only governs future completions.

Sibling task: #028 (PROGRESS.md trim bug). Both surfaced from the same investigation of `~/work/multi-repo-app` on 2026-08-18. #028 was split off because it has no open design questions; this task carries the decision above.

Known consumers of HISTORY.md to keep working (from `grep -rn "HISTORY.md" skills/`):
- `skills/plan-retrospect/SKILL.md` — mines it as a lesson corpus; tolerates an empty corpus
- `skills/plan-complete/SKILL.md:208` — appends the row (the write path to cap)
- `skills/plan-reopen/SKILL.md:109` — removes a row; already tolerates "row not found"
- `skills/plan-delete/SKILL.md:107` — removes a row for completed tasks
- `skills/plan-discuss/SKILL.md:58` — skims it for redundancy/overlap judgments
