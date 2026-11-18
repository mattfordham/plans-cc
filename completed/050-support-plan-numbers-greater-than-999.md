# Add support for plan numbers greater than 999

**ID:** 050
**Created:** 2026-10-07T00:00
**Type:** bug
**Status:** completed
**Completed:** 2026-10-07T00:00
**Branch:** fix/050-support-plan-numbers-greater-than-999

## What
Add support for plan numbers greater than 999. Currently are truncated, as seen in screenshot

![pasted image](file://~/Library/Application%20Support/Plans/attachments/2EFF1857-CCA1-4C5F-93CC-3892331EA5CB.png)

The terminal dashboard shows two different tasks both rendered as ID `100` in the ACTIVE TASKS list (while `998` and `999` display fine) — 4-digit IDs are being clipped to their first three characters, collapsing e.g. `1000` and `1001` onto the same displayed `100`.

## Why
Improves reliability by fixing silent ID truncation so that any project whose IDs reach 1000+ keeps unique, correctly-displayed identifiers. The truncation is not merely cosmetic: it collapses distinct tasks onto one displayed ID and quietly breaks blocked-by/dependency matching and sync-time reference rewriting for high IDs, so a long-lived project would start corrupting its own state.

## How Summary
Replace the fixed-width ID handling with leading-digit-run extraction. Every site that currently assumes an ID is exactly 3 characters — positional `filename.slice(0, 3)` extraction and `\d{3}` reference regexes — is switched to match the full run of leading digits (`/^(\d+)-/` for filenames, `\d{3,}` for in-text `#NNN` references), so IDs of any length ≥ 1 digit parse intact. Padding stays a *minimum* width (`padStart(3, "0")` already floors, never truncates), so the common 3-digit case is byte-identical. ID sorting switches from lexical string compare to numeric so `1000` orders after `999`.

**Files of note:**
- `lib/parse-tasks.js` — dashboard/task parser; origin of the screenshot symptom (`.slice(0, 3)` at lines 15 & 84, `\d{3}` blocked-by at line 45, lexical sort at line 119)
- `lib/render-progress.js` — PROGRESS.md renderer; same `.slice(0, 3)` truncation at line 51
- `lib/plans-git.js` — sync/renumber reference rewriters; `(\d{3})` at lines 393 & 402 miss ≥1000 IDs
- `lib/render-dashboard.js` — renderer; confirmed NOT the truncator (prints `task.id` raw at line 149), no change needed
- `test/parse-tasks.test.js`, `test/render-progress.test.js`, `test/plans-git.test.js` — existing node:test suites to extend with ≥1000-ID cases

## Diagnosis

**Most likely:** IDs are extracted by positional slicing `filename.slice(0, 3)` rather than by matching the leading digit run, so a 4-digit filename (`1000-foo.md`) yields `"100"` — truncating the ID before it is ever rendered (`lib/parse-tasks.js:15`, and again for completed IDs at `lib/parse-tasks.js:84`).
**Evidence:** `"1000-foo.md".slice(0, 3) === "100"`; the dashboard prints `task.id` verbatim at `lib/render-dashboard.js:149`, so the corruption is upstream in the parser, not the renderer. `998`/`999` survive because they are already exactly 3 characters. The same positional `.slice(0, 3)` recurs in the PROGRESS.md renderer at `lib/render-progress.js:51`.
**Confidence:** high

**Alternative:** Blocked-by / reference regexes hard-coded to exactly three digits silently fail to match ≥1000 IDs (`lib/parse-tasks.js:45` `/^#?(\d{3})$/`; `lib/plans-git.js:393` & `:402` `(\d{3})`) — **Confidence:** high (these are real latent bugs for high IDs, though they are collateral correctness damage rather than the specific display collision in the screenshot).

**Not the cause:** ~~`render-dashboard.js` `padRight`/`slice(0, width)`~~ — ruled out: `padRight` (line 67) is only applied to sub-repo names (line 132); `task.id` is printed raw (line 149). ~~`plans-git.js` `pad3`~~ (line 301) — `padStart(3, "0")` floors width, so `1000` → `"1000"`; it pads, never truncates.

**To confirm:** Add a failing unit test that feeds a `1000-*.md` task file to `parseTasks` and asserts the returned `id` is `"1000"` (not `"100"`) — agent-verifiable via `npm test`, reproducing the truncation before any fix.

## How
- [x] Step 1: Add a failing unit test in `test/parse-tasks.test.js` that creates a `1000-*.md` (and a `1001-*.md`) task file and asserts `parseTasks` returns ids `"1000"`/`"1001"` — not `"100"` — and that they do not collide (confirms the Diagnosis; agent-verifiable, so untagged)
- [x] Step 2: Fix ID extraction in `lib/parse-tasks.js` — replace `filename.slice(0, 3)` (line 15) and `f.slice(0, 3)` (line 84) with a leading-digit-run match (`(filename.match(/^(\d+)-/) || [])[1]`), and widen the blocked-by regex at line 45 from `/^#?(\d{3})$/` to `/^#?(\d{3,})$/` so ≥1000 IDs still match `completedIds`
- [x] Step 3: Make task ordering numeric in `lib/parse-tasks.js:119` — sort by `Number(a.id) - Number(b.id)` (within the existing status grouping) instead of `a.id.localeCompare(b.id)`, so `1000` orders after `999` rather than before it
- [x] Step 4: Fix the PROGRESS.md renderer in `lib/render-progress.js:51` — replace `f.slice(0, 3)` with the same leading-digit-run match, and make the recent-completed tiebreak sort (line 53) numeric so high IDs order correctly
- [x] Step 5: Widen the sync reference rewriters in `lib/plans-git.js` — change `(\d{3})` to `(\d{3,})` at lines 393 (blocked-by) and 402 (`Task #NNN`) so references to ≥1000 IDs are renumbered on sync collision; leave `pad3`/`padStart(3, "0")` as-is (it already floors, never truncates)
- [x] Step 6: Extend `test/render-progress.test.js` and `test/plans-git.test.js` with ≥1000-ID cases covering the renderer and the reference rewriters; run `npm test` and confirm the full suite (including the new Step 1 test) passes

## Verification
- `npm test` passes, including the new ≥1000-ID assertions in `test/parse-tasks.test.js`, `test/render-progress.test.js`, and `test/plans-git.test.js`.
- A task file named `1000-foo.md` (and `1001-bar.md`) parses to ids `"1000"`/`"1001"` and renders as distinct, un-truncated IDs in the terminal dashboard — no two distinct tasks collapse onto one displayed ID.
- Blocked-by resolution and sync-collision reference rewriting work for a ≥1000 ID (e.g. a task blocked by `#1000` is correctly matched against `completedIds`).
- The 3-digit common case is unchanged: existing IDs (`001`…`999`) still extract, pad, sort, and render byte-identically — no regression in the existing suite.

## Impact Scope

### Files to Modify
- [x] `lib/parse-tasks.js` — leading-digit-run ID extraction (lines 15, 84), `\d{3,}` blocked-by regex (line 45), numeric sort (line 119)
- [x] `lib/render-progress.js` — leading-digit-run ID extraction (line 51), numeric tiebreak sort (line 53)
- [x] `lib/plans-git.js` — `(\d{3,})` reference rewriters (lines 393, 402)
- [x] `test/parse-tasks.test.js` — add ≥1000-ID extraction / no-collision cases
- [x] `test/render-progress.test.js` — add ≥1000-ID renderer case
- [x] `test/plans-git.test.js` — add ≥1000-ID reference-rewrite case

### Related Files (may need updates)
- `lib/render-dashboard.js` — renderer only; confirmed NOT the truncator (prints `task.id` raw). No change required for the reported symptom; mixed 3/4-digit column alignment is cosmetic and out of scope.
- `CLAUDE.md`, `skills/**/SKILL.md` — document the "3-digit zero-padded" convention in prose (declarative, not executable). Not required for the runtime fix; ideally reworded to "minimum 3 digits" in a follow-up so skills don't re-encode a hard 3-digit cap when minting IDs. Left out of this task's scope (see Assumptions).

### Endpoints/UI Affected
- Terminal dashboard (`bin/dashboard.js` → `lib/render-dashboard.js`) ACTIVE TASKS list — IDs ≥ 1000 display un-truncated and distinct.
- Generated `.plans/PROGRESS.md` — recently-completed IDs ≥ 1000 display un-truncated.

## Assumptions

### Initial (from elaboration)
- [low] Scope includes all three independent 3-digit assumption sites (`parse-tasks.js`, `render-progress.js`, and the `plans-git.js` reference rewriters), not just the terminal dashboard that produced the screenshot. **Why:** research flagged them as independent latent bugs for high IDs; fixing only the dashboard would leave PROGRESS.md and sync/renumber silently broken for ≥1000 IDs — and the user's ask ("support for plan numbers greater than 999") is broader than the one screen.
- [low] Use variable-width leading-digit-run extraction (`/^(\d+)-/`) with padding kept as a *minimum* of 3 (`padStart(3, "0")`), rather than widening to a fixed 4 digits. **Why:** research recommended this; a fixed width just moves the collision wall to 10000 and would reformat the existing 3-digit common case, whereas `padStart` already floors (1000 → "1000") so the common case stays byte-identical. Assumes IDs are not required to be a fixed display width anywhere.
- [low] Switch ID sorting from lexical (`localeCompare`) to numeric. **Why:** with variable-width IDs, string compare orders "1000" before "999"; research called this out. Assumes numeric task order is the intended/least-surprising behavior in the dashboard and PROGRESS.md.
- [low] Documentation (`CLAUDE.md` and the `*.md` SKILL files) is left OUT of scope for this task. **Why:** those files are declarative/prose, do not cause the runtime truncation, and rewording the "3-digit" convention project-wide is a separate consistency pass best done deliberately rather than bundled into a bug fix. Noted as a follow-up in Impact Scope.
- [high] The runtime fix is display/parse-side only; nothing here changes how IDs are *minted* (skills still allocate from `config.json`'s `next_id`). **Why:** research confirmed the Node runtime does not mint IDs — `padStart` on the minting side already produces "1000" correctly, so the bug is entirely in extraction/rendering, which research traced with high confidence.

### Discovered during execution
- [high] Refined the blocked-by regex to `/^#?(\d{3}|[1-9]\d{3,})$/` rather than the plan's plain `/^#?(\d{3,})$/`. **Why:** the plain `\d{3,}` form accepted `#0430`, breaking the existing "tokens that are not 3-digit ids are ignored" test which deliberately rejects it as malformed. Since IDs are zero-padded to a *minimum* of 3, a genuine 4+ digit ID never has a leading zero (`1000`, never `0430`), so disallowing a leading zero on 4+ digit tokens preserves the existing rejection while still matching real ≥1000 IDs.
- [high] In `render-progress.js` kept the same defensive fallback shape segment 1 used in `parse-tasks.js`: `(f.match(/^(\d+)-/) || [])[1] || f.slice(0, 3)`. **Why:** consistency with the sibling fix, and the `|| f.slice(0,3)` branch preserves the old behavior for any filename that somehow lacks a leading `NNN-` prefix rather than yielding `undefined`.
- [low] The new `test/plans-git.test.js` ≥1000 case asserts directly on the renumbered file paths and reference rewrites rather than through the suite's `idsIn()` helper. **Why:** `idsIn()` filters on `/^\d{3}-/` and `f.slice(0,3)`, so it would itself truncate a 4-digit id — widening that test helper is outside this segment's scope, and asserting on the concrete `1001-beta.md` path / `#1001` references tests the fix more directly anyway.
- [low] The ≥1000 renderer test uses a date tie between `999` and `1000` so the assertion exercises the numeric id tiebreak specifically (1000 ordering above 999), not just the un-truncated render. **Why:** the tiebreak sort was the second half of Step 4 and a lexical compare would have put `1000` after `999`; a shared date is the only way to isolate that branch.

## Changes

Replaced fixed-width (3-char) ID handling with leading-digit-run extraction across the Node runtime so IDs ≥ 1000 parse, sort, and render intact; the 3-digit common case is byte-identical (padding left as `padStart(3, "0")`, which floors and never truncates).

- **`lib/parse-tasks.js`** — ID extraction in `parseFile` and `completedIds` now uses `(filename.match(/^(\d+)-/) || [])[1] || filename.slice(0, 3)` instead of `filename.slice(0, 3)` (the truncator: `"1000-foo.md".slice(0,3) === "100"`, the screenshot symptom). Blocked-by token regex widened from `/^#?(\d{3})$/` to `/^#?(\d{3}|[1-9]\d{3,})$/` so ≥1000 IDs match `completedIds` while malformed tokens like `#0430` stay rejected. Task ordering switched from `a.id.localeCompare(b.id)` to `Number(a.id) - Number(b.id)` so `1000` orders after `999`.
- **`lib/render-progress.js`** — PROGRESS.md recent-completed ID extraction switched to the same leading-digit-run match; recent-completed tiebreak sort made numeric (`Number(b.id) - Number(a.id)`), preserving its descending direction.
- **`lib/plans-git.js`** — sync reference rewriters widened from `(\d{3})` to `(\d{3,})` in both the `**Blocked by:**` rewriter and the ideas `Task #NNN` rewriter, so ≥1000-ID references are renumbered on sync collision. `pad3`/`padStart(3, "0")` left untouched (already floors).
- **`lib/render-dashboard.js`** — confirmed NOT the truncator (prints `task.id` raw); no change, as diagnosed.

### Tests (TDD)
- **`test/parse-tasks.test.js`** — added a `1000`/`1001` no-truncation/no-collision case and a ≥1000 blocked-by resolution case. Confirmed RED first (`['100','100']` collision; blocker unresolved), then GREEN after the fix.
- **`test/render-progress.test.js`** — added a ≥1000 renderer case (a `1000-*.md` renders as `#1000`, never `#100`, and outranks `999` on a date tie — isolating the numeric tiebreak).
- **`test/plans-git.test.js`** — added a ≥1000 reference-rewrite case: a two-clone `#1000` sync collision renumbers to `#1001` and rewrites `**Blocked by:** #1001` / `Task #1001` references un-truncated, driving real git via the existing `twoClones()` harness.

### Verification
Targeted run `node --test test/parse-tasks.test.js test/render-progress.test.js test/plans-git.test.js` → **74 pass, 0 fail**. Provenance asserted stable across both segments (branch and HEAD SHA unchanged before/after). Full suite deferred to review per the targeted-tests rule.

## Notes
This task was elaborated autonomously (no interactive prompts); the decisions above were recorded as assumptions for review. The screenshot symptom (two tasks showing `100`) is specifically caused by `lib/parse-tasks.js:15`; the other sites are included to make "support for IDs > 999" actually hold across the whole runtime.
